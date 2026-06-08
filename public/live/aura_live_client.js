/**
 * public/live/aura_live_client.js
 * Browser WebSocket client for AURA LIVE.
 * Manages connection, reconnection, and message routing.
 */
(function(global) {
  "use strict";

  class AuraLiveClient {
    constructor(options = {}) {
      this.wsUrl = options.wsUrl || "";
      this.token = options.token || "";
      this.ws = null;
      this.connected = false;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
      this.reconnectDelay = options.reconnectDelay || 2000;
      this.pingInterval = null;

      // Callbacks
      this.onConnect = null;
      this.onDisconnect = null;
      this.onError = null;
      this.onAudio = null;        // (base64) => {}
      this.onTranscription = null; // ({role, text, type}) => {}
      this.onToolResult = null;    // ({tool, status, result}) => {}
      this.onStatus = null;        // ({state, gemini_health, message}) => {}
    }

    /**
     * Connect to the AURA LIVE WebSocket server.
     */
    async connect() {
      if (this.connected) return;

      // Get token if not provided
      if (!this.token) {
        this.token = await this._getAuthToken();
      }
      if (!this.token) {
        console.error("[LiveClient] No auth token available");
        if (this.onError) this.onError(new Error("Authentication required"));
        return;
      }

      // Get WebSocket URL
      const wsUrl = this.wsUrl || this._getWsUrl();
      const url = wsUrl + "?token=" + encodeURIComponent(this.token);

      return new Promise((resolve, reject) => {
        try {
          this.ws = new WebSocket(url);

          this.ws.onopen = () => {
            this.connected = true;
            this.reconnecting = false;
            this.reconnectAttempts = 0;
            console.log("[LiveClient] Connected");
            this._startPing();
            if (this.onConnect) this.onConnect();
            resolve();
          };

          this.ws.onmessage = (event) => {
            this._handleMessage(event.data);
          };

          this.ws.onclose = (event) => {
            this.connected = false;
            this._stopPing();
            console.log("[LiveClient] Disconnected:", event.code, event.reason);
            if (this.onDisconnect) this.onDisconnect(event.code, event.reason);

            // Auto-reconnect if not intentional close
            if (event.code !== 4001 && event.code !== 4002 && this.reconnectAttempts < this.maxReconnectAttempts) {
              this._scheduleReconnect();
            }
          };

          this.ws.onerror = (event) => {
            console.error("[LiveClient] WebSocket error");
            if (this.onError) this.onError(event);
            if (!this.connected) reject(new Error("Connection failed"));
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    /**
     * Disconnect from the server.
     */
    disconnect() {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
      this._stopPing();
      if (this.ws) {
        this.ws.close(1000, "User disconnect");
        this.ws = null;
      }
      this.connected = false;
    }

    /**
     * Send raw audio to the server.
     */
    sendAudio(base64Data) {
      this._send({ type: "audio", data: base64Data });
    }

    /**
     * Send text message to the server.
     */
    sendText(content) {
      this._send({ type: "text", content });
    }

    /**
     * Send a camera frame to the server.
     */
    sendVisionFrame(base64Frame) {
      this._send({ type: "vision_frame", frame: base64Frame });
    }

    // ─── Internal ───

    _send(data) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    }

    _handleMessage(raw) {
      try {
        const msg = JSON.parse(raw);
        const type = msg.type;

        switch (type) {
          case "audio":
            if (this.onAudio) this.onAudio(msg.data);
            break;

          case "transcription":
            if (this.onTranscription) this.onTranscription({
              role: msg.role,
              text: msg.text,
              type: msg.type,
            });
            break;

          case "tool_result":
            if (this.onToolResult) this.onToolResult({
              tool: msg.tool,
              status: msg.status,
              result: msg.result,
              latency_ms: msg.latency_ms,
            });
            break;

          case "status":
            if (this.onStatus) this.onStatus({
              state: msg.state,
              gemini_health: msg.gemini_health,
              message: msg.message,
              session_id: msg.session_id,
              context: msg.context,
            });
            break;

          case "pong":
            // Heartbeat response
            break;

          case "error":
            console.error("[LiveClient] Server error:", msg.message);
            if (this.onError) this.onError(new Error(msg.message));
            break;

          default:
            console.log("[LiveClient] Unknown message type:", type, msg);
        }
      } catch (err) {
        console.error("[LiveClient] Parse error:", err);
      }
    }

    _startPing() {
      this._stopPing();
      this.pingInterval = setInterval(() => {
        this._send({ type: "ping", timestamp: Date.now() });
      }, 15000);
    }

    _stopPing() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    }

    _scheduleReconnect() {
      if (this.reconnecting) return;
      this.reconnecting = true;
      this.reconnectAttempts++;

      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
      console.log(`[LiveClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.reconnecting = false;
        this.connect().catch(err => {
          console.warn("[LiveClient] Reconnect failed:", err.message);
        });
      }, delay);
    }

    _getWsUrl() {
      // Try to determine WebSocket URL from current page
      if (window.__AURA_WS_URL__) return window.__AURA_WS_URL__;
      
      const loc = window.location;
      if (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") {
        return "ws://localhost:8000/ws/live";
      }
      // Production: same host, wss protocol
      return (loc.protocol === "https:" ? "wss://" : "ws://") + loc.host + "/ws/live";
    }

    async _getAuthToken() {
      try {
        if (window.FirebaseRuntimeConfig) {
          const auth = window.FirebaseRuntimeConfig.getAuth();
          if (auth && auth.currentUser) {
            return await auth.currentUser.getIdToken();
          }
        }
        if (window.auth && window.auth.currentUser) {
          return await window.auth.currentUser.getIdToken();
        }
      } catch (e) {
        console.warn("[LiveClient] Token fetch failed:", e);
      }
      return null;
    }
  }

  global.AuraLiveClient = AuraLiveClient;
})(window);
