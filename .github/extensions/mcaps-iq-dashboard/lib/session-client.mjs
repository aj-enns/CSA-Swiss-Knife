/**
 * Session Client — WebSocket client used by the extension to connect
 * to the shared dashboard server. Pushes session events and receives
 * chat/filter messages from the browser UI.
 */

import WebSocket from 'ws';

export function createSessionClient({ port, sessionId, metadata }) {
  let ws = null;
  let chatHandler = null;
  let filterHandler = null;
  let toolApprovalHandler = null;
  let autoApproveHandler = null;
  let stopHandler = null;
  let userInputHandler = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30000;

  function connect() {
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
      } catch (err) {
        return reject(err);
      }

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        reconnectDelay = 1000;
        ws.send(JSON.stringify({
          type: 'session:register',
          sessionId,
          metadata
        }));
        resolve();
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'chat:forward' && chatHandler) {
            chatHandler(msg.message || msg.data?.message);
          }
          if (msg.type === 'filter:update' && filterHandler) {
            filterHandler(msg.data || msg);
          }
          if (msg.type === 'tool:approval-response' && toolApprovalHandler) {
            toolApprovalHandler(msg.data || msg);
          }
          if (msg.type === 'auto-approve:update' && autoApproveHandler) {
            autoApproveHandler(msg.data?.autoApprove ?? msg.autoApprove);
          }
          if (msg.type === 'session:stop' && stopHandler) {
            stopHandler(msg.data || {});
          }
          if (msg.type === 'user-input:response' && userInputHandler) {
            userInputHandler(msg.data || {});
          }
        } catch { /* ignore parse errors */ }
      });

      ws.on('close', () => {
        scheduleReconnect();
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        if (ws.readyState === WebSocket.CONNECTING) {
          reject(err);
        }
      });
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
      });
    }, reconnectDelay);
  }

  function pushEvent(type, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'event',
      sessionId,
      event: { type, data }
    }));
  }

  function onChat(handler) { chatHandler = handler; }
  function onFilterChange(handler) { filterHandler = handler; }
  function onToolApproval(handler) { toolApprovalHandler = handler; }
  function onAutoApproveChange(handler) { autoApproveHandler = handler; }
  function onStop(handler) { stopHandler = handler; }
  function onUserInputResponse(handler) { userInputHandler = handler; }

  function close() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) {
      try {
        ws.send(JSON.stringify({ type: 'session:end', sessionId }));
        ws.close();
      } catch { /* noop */ }
      ws = null;
    }
  }

  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  return { connect, pushEvent, onChat, onFilterChange, onToolApproval, onAutoApproveChange, onStop, onUserInputResponse, close, isConnected };
}
