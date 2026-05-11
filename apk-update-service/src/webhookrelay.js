"use strict";

const WebSocket = require("ws");

const SOCKET_URL = "wss://my.webhookrelay.com/v1/socket";
const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 60_000;

function createWebhookrelayClient({ config, onRelease, logger }) {
  const { key, secret, bucket } = config.webhookrelay;

  let ws = null;
  let stopped = false;
  let reconnectTimer = null;
  let pingTimer = null;
  let backoffMs = 1_000;
  const status = {
    connected: false,
    authenticated: false,
    subscribed: false,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastEventAt: null,
    lastError: null,
    reconnectAttempts: 0,
  };

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    clearReconnect();
    status.reconnectAttempts += 1;
    const delay = Math.min(
      backoffMs * Math.max(1, status.reconnectAttempts),
      MAX_BACKOFF_MS
    );
    logger.info({ delay }, "Scheduling reconnect");
    reconnectTimer = setTimeout(() => connect(), delay);
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch (err) {
      logger.warn({ err }, "Failed to send webhookrelay message");
      return false;
    }
  }

  function handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      logger.warn({ err, raw: raw.toString().slice(0, 200) }, "Non-JSON message from webhookrelay");
      return;
    }

    const type = (msg.type || msg.action || "").toString();

    if (type === "status" || type === "auth") {
      if (msg.status === "authenticated" || msg.authenticated === true || msg.success === true) {
        status.authenticated = true;
        logger.info("Authenticated to webhookrelay");
        subscribe();
      } else if (msg.status === "subscribed" || msg.subscribed === true) {
        status.subscribed = true;
        logger.info({ bucket }, "Subscribed to bucket");
      } else if (msg.status) {
        logger.debug({ status: msg.status }, "webhookrelay status update");
      }
      return;
    }

    if (type === "error") {
      status.lastError = msg.message || msg.error || "unknown";
      logger.warn({ msg }, "webhookrelay error message");
      return;
    }

    if (type === "ping" || type === "pong") {
      return;
    }

    if (type === "webhook" || msg.body !== undefined || msg.headers !== undefined) {
      status.lastEventAt = new Date().toISOString();
      dispatchWebhook(msg);
      return;
    }

    logger.debug({ msg }, "Unhandled webhookrelay message");
  }

  function dispatchWebhook(msg) {
    let bodyObj = null;
    if (msg.body && typeof msg.body === "string") {
      try {
        bodyObj = JSON.parse(msg.body);
      } catch (err) {
        logger.warn({ err }, "Webhook body is not JSON");
        return;
      }
    } else if (msg.body && typeof msg.body === "object") {
      bodyObj = msg.body;
    } else {
      logger.warn({ keys: Object.keys(msg) }, "Webhook message missing body");
      return;
    }

    try {
      Promise.resolve(onRelease(bodyObj, msg)).catch((err) => {
        logger.error({ err }, "Release handler rejected");
      });
    } catch (err) {
      logger.error({ err }, "Release handler threw");
    }
  }

  function subscribe() {
    if (!send({ action: "subscribe", buckets: [bucket] })) {
      logger.warn("Could not send subscribe message");
    }
  }

  function connect() {
    if (stopped) return;
    clearReconnect();
    logger.info({ url: SOCKET_URL }, "Connecting to webhookrelay");

    let socket;
    try {
      socket = new WebSocket(SOCKET_URL, {
        handshakeTimeout: 15_000,
        perMessageDeflate: false,
      });
    } catch (err) {
      logger.error({ err }, "WebSocket constructor failed");
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.on("open", () => {
      status.connected = true;
      status.lastConnectedAt = new Date().toISOString();
      status.reconnectAttempts = 0;
      backoffMs = 1_000;
      logger.info("WebSocket open, authenticating");
      send({ action: "auth", key, secret });

      clearPing();
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.ping();
          } catch (_err) {
            /* ignore */
          }
        }
      }, PING_INTERVAL_MS);
    });

    socket.on("message", handleMessage);

    socket.on("error", (err) => {
      status.lastError = err.message;
      logger.warn({ err }, "WebSocket error");
    });

    socket.on("close", (code, reason) => {
      status.connected = false;
      status.authenticated = false;
      status.subscribed = false;
      status.lastDisconnectedAt = new Date().toISOString();
      clearPing();
      logger.info(
        { code, reason: reason && reason.toString() },
        "WebSocket closed"
      );
      ws = null;
      scheduleReconnect();
    });
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    async stop() {
      stopped = true;
      clearReconnect();
      clearPing();
      if (ws) {
        try {
          ws.close(1000, "shutdown");
        } catch (_err) {
          /* ignore */
        }
        ws = null;
      }
    },
    reconnect() {
      logger.info("Manual reconnect requested");
      if (ws) {
        try {
          ws.close(1012, "manual reconnect");
        } catch (_err) {
          /* ignore */
        }
      } else {
        scheduleReconnect();
      }
    },
    status() {
      return { ...status, bucket };
    },
  };
}

module.exports = { createWebhookrelayClient };
