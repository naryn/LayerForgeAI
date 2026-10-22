#include "web_bridge_wasm.hpp"

#ifdef Q_OS_WASM

#include "dialog_utils_wasm.hpp"
#include "image_document_io.hpp"
#include "main_window.hpp"
#include "script_engine.hpp"

#include "core/layer_render_utils.hpp"
#include "core/rect_utils.hpp"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QSaveFile>
#include <QSet>

#include <algorithm>
#include <emscripten/val.h>

namespace patchy::ui {

namespace {

constexpr int kProtocolVersion = 2;

QString jsLiteral(const QJsonValue& value) {
  QJsonArray wrapper;
  wrapper.append(value);
  const auto json = QJsonDocument(wrapper).toJson(QJsonDocument::Compact);
  return QString::fromUtf8(json.mid(1, json.size() - 2));
}

bool savedPsdPath(const QString& path) {
  const auto parts = path.split(QLatin1Char('/'), Qt::SkipEmptyParts);
  return QDir::cleanPath(path) == path && parts.size() == 2 &&
         parts[0] == QStringLiteral("saved") && !parts[1].isEmpty() &&
         (path.endsWith(QStringLiteral(".psd"), Qt::CaseInsensitive) ||
          path.endsWith(QStringLiteral(".psb"), Qt::CaseInsensitive));
}

bool savedPngPath(const QString& path) {
  const auto parts = path.split(QLatin1Char('/'), Qt::SkipEmptyParts);
  return QDir::cleanPath(path) == path && parts.size() == 2 &&
         parts[0] == QStringLiteral("saved") && !parts[1].isEmpty() &&
         path.endsWith(QStringLiteral(".png"), Qt::CaseInsensitive);
}

bool stagedOpenPath(const QString& path) {
  const auto parts = path.split(QLatin1Char('/'), Qt::SkipEmptyParts);
  bool transferNumber = false;
  if (parts.size() == 3) parts[1].toULongLong(&transferNumber);
  return QDir::cleanPath(path) == path && parts.size() == 3 &&
         parts[0] == QStringLiteral("opened") && transferNumber && !parts[2].isEmpty();
}

QImage loadPreviewRgba(const QString& path) {
  const QImage image(path);
  if (image.isNull()) return {};
  return image.format() == QImage::Format_RGBA8888 ? image
                                                   : image.convertToFormat(QImage::Format_RGBA8888);
}

// Compares two bridge-rendered preview PNGs without sending pixel data through
// the JSON queue. Raw RGBA is compared, matching the E2E evidence digests.
bool compareSavedPreviews(const QString& beforePath, const QString& afterPath,
                          QJsonObject* result, QString* errorCode, QString* errorMessage) {
  if (!savedPngPath(beforePath) || !savedPngPath(afterPath)) {
    *errorCode = QStringLiteral("INVALID_REQUEST");
    *errorMessage = QStringLiteral("comparePreview requires two /saved/*.png paths");
    return false;
  }
  if (beforePath == afterPath) {
    *errorCode = QStringLiteral("INVALID_REQUEST");
    *errorMessage = QStringLiteral("comparePreview requires two different preview paths");
    return false;
  }
  const auto before = loadPreviewRgba(beforePath);
  const auto after = loadPreviewRgba(afterPath);
  if (before.isNull() || after.isNull()) {
    *errorCode = QStringLiteral("INVALID_REQUEST");
    *errorMessage = QStringLiteral("One of the preview files is missing or not a PNG");
    return false;
  }
  QJsonObject sizes{{QStringLiteral("beforeWidth"), before.width()},
                    {QStringLiteral("beforeHeight"), before.height()},
                    {QStringLiteral("afterWidth"), after.width()},
                    {QStringLiteral("afterHeight"), after.height()}};
  if (before.size() != after.size()) {
    *result = QJsonObject{{QStringLiteral("sameSize"), false},
                          {QStringLiteral("width"), before.width()},
                          {QStringLiteral("height"), before.height()},
                          {QStringLiteral("totalPixels"), 0},
                          {QStringLiteral("differingPixels"), 0},
                          {QStringLiteral("ratio"), 0.0},
                          {QStringLiteral("maxDelta"), 0},
                          {QStringLiteral("bounds"), QJsonValue(QJsonValue::Null)},
                          {QStringLiteral("sizes"), sizes}};
    return true;
  }
  const auto width = before.width();
  const auto height = before.height();
  qint64 differing = 0;
  int maxDelta = 0;
  int minX = width;
  int minY = height;
  int maxX = -1;
  int maxY = -1;
  for (int y = 0; y < height; ++y) {
    const auto* rowBefore = before.constScanLine(y);
    const auto* rowAfter = after.constScanLine(y);
    for (int x = 0; x < width; ++x) {
      int delta = 0;
      for (int channel = 0; channel < 4; ++channel) {
        const auto index = static_cast<qsizetype>(x) * 4 + channel;
        delta = std::max(delta, qAbs(static_cast<int>(rowBefore[index]) -
                                     static_cast<int>(rowAfter[index])));
      }
      if (delta == 0) continue;
      ++differing;
      maxDelta = std::max(maxDelta, delta);
      minX = std::min(minX, x);
      minY = std::min(minY, y);
      maxX = std::max(maxX, x);
      maxY = std::max(maxY, y);
    }
  }
  const auto total = static_cast<qint64>(width) * height;
  QJsonObject bounds;
  if (differing > 0 && maxX >= 0 && maxY >= 0) {
    bounds = QJsonObject{{QStringLiteral("x"), minX},
                         {QStringLiteral("y"), minY},
                         {QStringLiteral("width"), maxX - minX + 1},
                         {QStringLiteral("height"), maxY - minY + 1}};
  }
  *result = QJsonObject{{QStringLiteral("sameSize"), true},
                        {QStringLiteral("width"), width},
                        {QStringLiteral("height"), height},
                        {QStringLiteral("totalPixels"), total},
                        {QStringLiteral("differingPixels"), differing},
                        {QStringLiteral("ratio"), total > 0 ? static_cast<double>(differing) / total : 0.0},
                        {QStringLiteral("maxDelta"), maxDelta},
                        {QStringLiteral("bounds"), differing > 0 ? QJsonValue(bounds) : QJsonValue(QJsonValue::Null)},
                        {QStringLiteral("sizes"), sizes}};
  return true;
}

// Renders one layer the way the GIF/sprite exports do: a scratch document with
// the layer forced visible, cropped to its render bounds. The live document is
// never mutated, and ancestor group opacity/masks/clipping are intentionally
// not applied because this layer is rendered alone.
bool renderSavedLayer(const QString& documentId, const Document& document, const Layer& layer,
                      const QString& path, QJsonObject* result, QString* errorCode,
                      QString* errorMessage) {
  const auto renderBounds =
      intersect_rect(layer_render_bounds(layer), Rect::from_size(document.width(), document.height()));
  if (renderBounds.width <= 0 || renderBounds.height <= 0) {
    *errorCode = QStringLiteral("EMPTY_RENDER");
    *errorMessage = QStringLiteral("Layer has no visible pixels inside the document canvas");
    return false;
  }
  Document scratch(document.width(), document.height(), PixelFormat::rgba8());
  Layer copy = layer;
  copy.set_visible(true);
  scratch.add_layer(std::move(copy));
  const auto image = qimage_from_document_rect(
      scratch, QRect(renderBounds.x, renderBounds.y, renderBounds.width, renderBounds.height), true);
  if (image.isNull()) {
    *errorCode = QStringLiteral("SCRIPT_ERROR");
    *errorMessage = QStringLiteral("Isolated layer render produced no image");
    return false;
  }
  QDir().mkpath(QStringLiteral("/saved"));
  if (QFileInfo::exists(path)) {
    *errorCode = QStringLiteral("INVALID_REQUEST");
    *errorMessage = QStringLiteral("Refusing to overwrite an existing render");
    return false;
  }
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || !image.save(&file, "PNG") || !file.commit()) {
    *errorCode = QStringLiteral("SCRIPT_ERROR");
    *errorMessage = QStringLiteral("Could not save the isolated layer render: ") + path;
    return false;
  }
  *result = QJsonObject{
      {QStringLiteral("documentId"), documentId},
      {QStringLiteral("layerId"), QString::number(layer.id())},
      {QStringLiteral("path"), path},
      {QStringLiteral("isolated"), true},
      {QStringLiteral("width"), image.width()},
      {QStringLiteral("height"), image.height()},
      {QStringLiteral("bounds"), QJsonObject{{QStringLiteral("x"), renderBounds.x},
                                             {QStringLiteral("y"), renderBounds.y},
                                             {QStringLiteral("width"), renderBounds.width},
                                             {QStringLiteral("height"), renderBounds.height}}}};
  return true;
}

}  // namespace

WebBridgeWasm::WebBridgeWasm(MainWindow& window)
    : QObject(&window), host_(window.script_engine_host()) {
  timer_.setInterval(50);
  connect(&timer_, &QTimer::timeout, this, &WebBridgeWasm::poll);
  connect(&host_, &ScriptEngineHost::run_state_changed, this, [this] {
    if (!pendingId_.isEmpty() && !host_.run_active()) finishScript();
  });
  connect(&host_, &ScriptEngineHost::message_emitted, this,
          [this](int, const QString& text) { if (!pendingId_.isEmpty()) messages_.append(text); });
  timer_.start();
}

void WebBridgeWasm::poll() {
  if (!pendingId_.isEmpty()) {
    if (isCancelled(pendingId_)) {
      pendingCancelled_ = true;
      if (host_.run_active()) host_.stop_active_run();
      else finishScript();
    }
    return;
  }
  if (host_.run_active()) return;
  auto queue = emscripten::val::global("window")["__patchyM0Requests"];
  if (queue.isUndefined() || queue.isNull() || queue["length"].as<unsigned>() == 0) return;
  const auto entry = queue.call<emscripten::val>("shift");
  const auto json = emscripten::val::global("JSON")
                        .call<emscripten::val>("stringify", entry)
                        .as<std::string>();
  QJsonParseError parseError;
  const auto parsed = QJsonDocument::fromJson(QByteArray::fromStdString(json), &parseError);
  if (parseError.error != QJsonParseError::NoError || !parsed.isObject()) return;
  dispatch(parsed.object());
}

void WebBridgeWasm::dispatch(const QJsonObject& request) {
  const auto id = request.value(QStringLiteral("requestId")).toString();
  const auto clientId = request.value(QStringLiteral("clientId")).toString();
  const auto operation = request.value(QStringLiteral("operation")).toString();
  const auto payload = request.value(QStringLiteral("payload")).toObject();
  if (id.isEmpty() || clientId.isEmpty()) return;
  if (request.value(QStringLiteral("protocolVersion")).toInt(-1) != kProtocolVersion) {
    publish(id, clientId, false, {}, QStringLiteral("PROTOCOL_MISMATCH"),
            QStringLiteral("Unsupported Patchy bridge protocol version"));
    return;
  }
  if (isCancelled(id)) {
    publish(id, clientId, false, {}, QStringLiteral("CANCELLED"),
            QStringLiteral("Request was cancelled before dispatch"));
    return;
  }

  if (operation == QStringLiteral("getState")) {
    publish(id, clientId, true,
            QJsonObject{{QStringLiteral("state"), host_.automation_state()},
                        {QStringLiteral("fingerprint"), host_.automation_fingerprint()}});
    return;
  }

  if (operation == QStringLiteral("comparePreview")) {
    QJsonObject result;
    QString compareErrorCode;
    QString compareErrorMessage;
    if (compareSavedPreviews(payload.value(QStringLiteral("beforePath")).toString(),
                             payload.value(QStringLiteral("afterPath")).toString(),
                             &result, &compareErrorCode, &compareErrorMessage)) {
      publish(id, clientId, true, result);
    } else {
      publish(id, clientId, false, {}, compareErrorCode, compareErrorMessage);
    }
    return;
  }

  if (operation == QStringLiteral("renderLayer")) {
    const auto path = payload.value(QStringLiteral("path")).toString();
    if (!savedPngPath(path)) {
      publish(id, clientId, false, {}, QStringLiteral("INVALID_REQUEST"),
              QStringLiteral("renderLayer requires a /saved/*.png path"));
      return;
    }
    const auto documentId = payload.value(QStringLiteral("documentId")).toString();
    bool documentOk = false;
    const auto documentKey = documentId.toLongLong(&documentOk);
    bool layerOk = false;
    const auto layerKey = payload.value(QStringLiteral("layerId")).toString().toULongLong(&layerOk);
    if (!documentOk || !layerOk) {
      publish(id, clientId, false, {}, QStringLiteral("INVALID_REQUEST"),
              QStringLiteral("renderLayer requires numeric documentId and layerId"));
      return;
    }
    if (host_.run_active()) {
      publish(id, clientId, false, {}, QStringLiteral("BUSY"),
              QStringLiteral("Patchy script engine is busy"));
      return;
    }
    const auto* document = host_.session_document_const(documentKey);
    if (document == nullptr) {
      publish(id, clientId, false, {}, QStringLiteral("DOCUMENT_NOT_FOUND"),
              QStringLiteral("The target document is no longer open"));
      return;
    }
    const auto* layer = document->find_layer(layerKey);
    if (layer == nullptr) {
      publish(id, clientId, false, {}, QStringLiteral("DOCUMENT_NOT_FOUND"),
              QStringLiteral("The target layer does not exist in this document"));
      return;
    }
    QJsonObject result;
    QString renderErrorCode;
    QString renderErrorMessage;
    if (renderSavedLayer(documentId, *document, *layer, path, &result, &renderErrorCode,
                         &renderErrorMessage)) {
      publish(id, clientId, true, result);
    } else {
      publish(id, clientId, false, {}, renderErrorCode, renderErrorMessage);
    }
    return;
  }

  QString errorCode;
  QString errorMessage;
  if (!validatePrecondition(operation, payload,
                            request.value(QStringLiteral("precondition")).toObject(),
                            &errorCode, &errorMessage)) {
    publish(id, clientId, false, {}, errorCode, errorMessage);
    return;
  }

  QString error;
  QString downloadPath;
  const auto source = scriptFor(operation, payload, &error, &downloadPath);
  if (source.isEmpty()) {
    publish(id, clientId, false, {}, QStringLiteral("INVALID_REQUEST"), error);
    return;
  }
  if (host_.run_active()) {
    publish(id, clientId, false, {}, QStringLiteral("BUSY"),
            QStringLiteral("Patchy script engine is busy"));
    return;
  }
  pendingId_ = id;
  pendingClientId_ = clientId;
  pendingDownloadPath_ = downloadPath;
  pendingCancelled_ = false;
  messages_.clear();
  // run_source() returns false for a script error as well as for a busy engine;
  // a script error is reported through run_state_changed() with SCRIPT_ERROR.
  host_.run_source(source, {
      .name = QStringLiteral("PSD Normalize Studio M0: ") + operation,
      .path = {}, .args = {}, .unattended = true});
}

void WebBridgeWasm::finishScript() {
  const auto id = pendingId_;
  const auto clientId = pendingClientId_;
  const auto downloadPath = pendingDownloadPath_;
  const bool cancelled = pendingCancelled_;
  pendingId_.clear();
  pendingClientId_.clear();
  pendingDownloadPath_.clear();
  pendingCancelled_ = false;
  if (cancelled) {
    publish(id, clientId, false, {}, QStringLiteral("CANCELLED"),
            QStringLiteral("Patchy request was cancelled"));
    return;
  }
  if (host_.last_run_had_error()) {
    publish(id, clientId, false, {}, QStringLiteral("SCRIPT_ERROR"),
            messages_.join(QLatin1Char('\n')));
    return;
  }
  if (!downloadPath.isEmpty()) {
    patchy::ui::wasm_files::download_file_in_browser(downloadPath);
  }
  publish(id, clientId, true, host_.last_result());
}

bool WebBridgeWasm::validatePrecondition(const QString& operation,
                                         const QJsonObject& payload,
                                         const QJsonObject& precondition,
                                         QString* errorCode,
                                         QString* errorMessage) const {
  if (operation != QStringLiteral("renameLayer") &&
      operation != QStringLiteral("groupLayers") &&
      operation != QStringLiteral("mergeLayers") &&
      operation != QStringLiteral("undo") &&
      operation != QStringLiteral("saveAsAndReopen")) {
    return true;
  }
  const auto documentId = payload.value(QStringLiteral("documentId")).toString();
  if (precondition.isEmpty() ||
      precondition.value(QStringLiteral("documentId")).toString() != documentId ||
      precondition.value(QStringLiteral("revision")).toString().isEmpty()) {
    *errorCode = QStringLiteral("PRECONDITION_REQUIRED");
    *errorMessage = QStringLiteral("Mutating operations require documentId and revision preconditions");
    return false;
  }
  const auto state = host_.automation_state();
  QJsonObject document;
  for (const auto& value : state.value(QStringLiteral("documents")).toArray()) {
    const auto candidate = value.toObject();
    if (candidate.value(QStringLiteral("id")).toString() == documentId) {
      document = candidate;
      break;
    }
  }
  if (document.isEmpty()) {
    *errorCode = QStringLiteral("DOCUMENT_NOT_FOUND");
    *errorMessage = QStringLiteral("The target document is no longer open");
    return false;
  }
  const auto expectedRevision = precondition.value(QStringLiteral("revision")).toString();
  const auto actualRevision = document.value(QStringLiteral("revision")).toString();
  const auto expectedFingerprint = precondition.value(QStringLiteral("fingerprint")).toString();
  if (expectedRevision != actualRevision ||
      (!expectedFingerprint.isEmpty() && expectedFingerprint != host_.automation_fingerprint())) {
    *errorCode = QStringLiteral("STALE_DOCUMENT");
    *errorMessage = QStringLiteral("Document state changed; refresh before applying the mutation");
    return false;
  }
  return true;
}

bool WebBridgeWasm::isCancelled(const QString& requestId) const {
  auto cancelled = emscripten::val::global("window")["__patchyM0Cancelled"];
  if (cancelled.isUndefined() || cancelled.isNull()) return false;
  const auto value = cancelled[requestId.toStdString()];
  return !value.isUndefined() && !value.isNull() && value.as<bool>();
}

void WebBridgeWasm::clearCancellation(const QString& requestId) const {
  auto cancelled = emscripten::val::global("window")["__patchyM0Cancelled"];
  if (cancelled.isUndefined() || cancelled.isNull()) return;
  emscripten::val::global("Reflect").call<bool>(
      "deleteProperty", cancelled, emscripten::val(requestId.toStdString()));
}

QString WebBridgeWasm::scriptFor(const QString& operation, const QJsonObject& payload,
                                 QString* error, QString* downloadPath) const {
  const auto documentId = payload.value(QStringLiteral("documentId")).toString();
  if (operation == QStringLiteral("openDocument")) {
    const auto path = payload.value(QStringLiteral("path")).toString();
    if (!stagedOpenPath(path)) {
      *error = QStringLiteral("openDocument only accepts Patchy-staged /opened paths");
      return {};
    }
    return QStringLiteral("const d=app.open(%1);patchy.setResult({documentId:d.id});")
        .arg(jsLiteral(path));
  }
  if (documentId.isEmpty()) {
    *error = QStringLiteral("documentId is required");
    return {};
  }
  if (operation == QStringLiteral("renameLayer")) {
    const auto layerId = payload.value(QStringLiteral("layerId")).toString();
    const auto name = payload.value(QStringLiteral("name")).toString();
    if (layerId.isEmpty() || name.isEmpty() || name.toUtf8().size() > 4096) {
      *error = QStringLiteral("layerId and a 1..4096-byte UTF-8 name are required");
      return {};
    }
    return QStringLiteral(
        "const d=app.getDocument(%1);const l=d.getLayer(%2);l.name=%3;"
        "patchy.setResult({documentId:d.id,layerId:l.id,name:l.name});")
        .arg(jsLiteral(documentId), jsLiteral(layerId), jsLiteral(name));
  }
  if (operation == QStringLiteral("groupLayers") ||
      operation == QStringLiteral("mergeLayers")) {
    const auto name = payload.value(QStringLiteral("name")).toString();
    const auto minimum = operation == QStringLiteral("groupLayers") ? 2 : 1;
    if (!name.isEmpty() && name.toUtf8().size() > 4096) {
      *error = QStringLiteral("Layer name must be at most 4096 UTF-8 bytes");
      return {};
    }
    QJsonArray ids;
    QSet<QString> seen;
    for (const auto& value : payload.value(QStringLiteral("layerIds")).toArray()) {
      const auto id = value.toString();
      if (id.isEmpty() || seen.contains(id)) {
        *error = QStringLiteral("layerIds must be unique non-empty layer ids");
        return {};
      }
      seen.insert(id);
      ids.append(id);
    }
    if (ids.size() < minimum) {
      *error = operation == QStringLiteral("groupLayers")
          ? QStringLiteral("groupLayers needs at least two layer ids")
          : QStringLiteral("mergeLayers needs at least one layer id");
      return {};
    }
    if (operation == QStringLiteral("groupLayers")) {
      return QStringLiteral(
          "const d=app.getDocument(%1);const ls=%2.map(function(id){return d.getLayer(id)});"
          "const g=d.groupLayers(ls,%3);"
          "patchy.setResult({documentId:d.id,groupId:g.id,name:g.name,"
          "layerIds:g.children.map(function(l){return l.id})});")
          .arg(jsLiteral(documentId), jsLiteral(ids), jsLiteral(name));
    }
    const auto rename = name.isEmpty()
        ? QString()
        : QStringLiteral("r.name=%1;").arg(jsLiteral(name));
    return QStringLiteral(
        "const d=app.getDocument(%1);const ls=%2.map(function(id){return d.getLayer(id)});"
        "const out=d.mergeLayers(ls,{keepVectors:false,withinGroups:false,"
        "separateVectorTypes:false});"
        "if(!out||!out.length)throw new Error('mergeLayers returned no layers');"
        "const r=out[0];%3"
        "patchy.setResult({documentId:d.id,layerId:r.id,name:r.name,"
        "layerIds:out.map(function(l){return l.id})});")
        .arg(jsLiteral(documentId), jsLiteral(ids), rename);
  }
  if (operation == QStringLiteral("undo")) {
    return QStringLiteral(
        "const d=app.getDocument(%1);"
        "if(!d.undo())throw new Error('No document state to undo');"
        "patchy.setResult({documentId:d.id});")
        .arg(jsLiteral(documentId));
  }
  if (operation == QStringLiteral("renderPreview")) {
    const auto path = payload.value(QStringLiteral("path")).toString();
    if (!savedPngPath(path)) {
      *error = QStringLiteral("renderPreview requires a /saved/*.png path");
      return {};
    }
    if (payload.value(QStringLiteral("download")).toBool()) *downloadPath = path;
    return QStringLiteral(
        "patchy.io.makeDir('/saved');const d=app.getDocument(%1);"
        "if(patchy.io.fileExists(%2))throw new Error('Refusing to overwrite preview');"
        "const p=d.renderPreview(%2);patchy.setResult(p);")
        .arg(jsLiteral(documentId), jsLiteral(path));
  }
  if (operation == QStringLiteral("saveAsAndReopen")) {
    const auto path = payload.value(QStringLiteral("path")).toString();
    if (!savedPsdPath(path)) {
      *error = QStringLiteral("saveAsAndReopen requires a new /saved/*.psd or .psb path");
      return {};
    }
    // Patchy's save coordinator already calls offer_browser_download_for_saved_file
    // for this write; downloading again here would duplicate the PSD transfer.
    return QStringLiteral(
        "patchy.io.makeDir('/saved');const d=app.getDocument(%1);"
        "if(patchy.io.fileExists(%2))throw new Error('Refusing to overwrite PSD');"
        "if(!d.saveAs(%2))throw new Error('PSD save failed');d.close();"
        "const r=app.open(%2);patchy.setResult({documentId:r.id,path:r.path});")
        .arg(jsLiteral(documentId), jsLiteral(path));
  }
  *error = QStringLiteral("Unsupported bridge operation: ") + operation;
  return {};
}

void WebBridgeWasm::publish(const QString& id, const QString& clientId, bool ok,
                            const QJsonValue& result, const QString& errorCode,
                            const QString& errorMessage) {
  const QJsonValue error = ok ? QJsonValue(QJsonValue::Null)
      : QJsonValue(QJsonObject{{QStringLiteral("code"), errorCode},
                               {QStringLiteral("message"), errorMessage}});
  const QJsonObject response{{QStringLiteral("protocolVersion"), kProtocolVersion},
                             {QStringLiteral("requestId"), id},
                             {QStringLiteral("clientId"), clientId},
                             {QStringLiteral("ok"), ok},
                             {QStringLiteral("result"), result},
                             {QStringLiteral("error"), error}};
  const auto json = QJsonDocument(response).toJson(QJsonDocument::Compact).toStdString();
  auto parsed = emscripten::val::global("JSON").call<emscripten::val>("parse", json);
  auto queue = emscripten::val::global("window")["__patchyM0Responses"];
  if (!queue.isUndefined() && !queue.isNull()) queue.call<void>("push", parsed);
  clearCancellation(id);
}

}  // namespace patchy::ui

#endif

