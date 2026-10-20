#pragma once

#include <QtSystemDetection>

#ifdef Q_OS_WASM

#include <QJsonObject>
#include <QObject>
#include <QStringList>
#include <QTimer>

namespace patchy::ui {

class MainWindow;
class ScriptEngineHost;

// M0 integration candidate. This file is intentionally outside the pinned
// upstream checkout until the Windows WASM validation lane can compile it.
class WebBridgeWasm final : public QObject {
  Q_OBJECT

public:
  explicit WebBridgeWasm(MainWindow& window);

private:
  void poll();
  void dispatch(const QJsonObject& request);
  void finishScript();
  void publish(const QString& requestId, const QString& clientId, bool ok,
               const QJsonValue& result, const QString& errorCode = {},
               const QString& errorMessage = {});
  bool isCancelled(const QString& requestId) const;
  void clearCancellation(const QString& requestId) const;
  bool validatePrecondition(const QString& operation, const QJsonObject& payload,
                            const QJsonObject& precondition, QString* errorCode,
                            QString* errorMessage) const;
  QString scriptFor(const QString& operation, const QJsonObject& payload, QString* error,
                    QString* downloadPath) const;

  ScriptEngineHost& host_;
  QTimer timer_;
  QString pendingId_;
  QString pendingClientId_;
  QString pendingDownloadPath_;
  QStringList messages_;
  bool pendingCancelled_{false};
};

}  // namespace patchy::ui

#endif

