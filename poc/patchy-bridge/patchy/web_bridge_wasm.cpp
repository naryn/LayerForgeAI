#include "web_bridge_wasm.hpp"

#ifdef Q_OS_WASM

#include "dialog_utils_wasm.hpp"
#include "main_window.hpp"
#include "script_engine.hpp"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonValue>
#include <QDir>

#include <emscripten/val.h>

namespace patchy::ui {

namespace {

constexpr int kProtocolVersion = 1;

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

