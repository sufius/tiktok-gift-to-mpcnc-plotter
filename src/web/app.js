const statusText = document.getElementById('status-text');
const dryRunText = document.getElementById('dryrun-text');
const serialText = document.getElementById('serial-text');
const workerText = document.getElementById('worker-text');
const tiktokText = document.getElementById('tiktok-text');
const dryRunToggle = document.getElementById('dryrun-toggle');
const noTiktokToggle = document.getElementById('no-tiktok-toggle');
const refreshBtn = document.getElementById('refresh-status');
const refreshPositionBtn = document.getElementById('refresh-position');
const connectForm = document.getElementById('connect-form');
const disconnectBtn = document.getElementById('disconnect-btn');
const giftForm = document.getElementById('gift-form');
const paperChangedBtn = document.getElementById('paper-changed');
const reloadMappingBtn = document.getElementById('reload-mapping');
const zeroPositionBtn = document.getElementById('zero-position');
const clearLogBtn = document.getElementById('clear-log');
const logOutput = document.getElementById('log-output');

const portInput = document.getElementById('port-input');
const baudInput = document.getElementById('baud-input');
const rowInput = document.getElementById('row-input');
const countInput = document.getElementById('count-input');

const curlDryRun = document.getElementById('curl-dryrun');
const curlNoTiktok = document.getElementById('curl-no-tiktok');
const curlConnect = document.getElementById('curl-connect');
const curlDisconnect = document.getElementById('curl-disconnect');
const curlGift = document.getElementById('curl-gift');
const curlPaper = document.getElementById('curl-paper');
const curlMapping = document.getElementById('curl-mapping');
const curlZero = document.getElementById('curl-zero');
const curlPosition = document.getElementById('curl-position');

const posX = document.getElementById('pos-x');
const posY = document.getElementById('pos-y');
const posZ = document.getElementById('pos-z');
const posUpdated = document.getElementById('pos-updated');

const jogStepInput = document.getElementById('jog-step');
const jogFeedXYInput = document.getElementById('jog-feed-xy');
const jogFeedZInput = document.getElementById('jog-feed-z');
const jogButtons = document.querySelectorAll('[data-jog]');

const baseUrl = window.location.origin;

function logLine(message, detail) {
  const ts = new Date().toLocaleTimeString();
  const payload = detail ? ` ${JSON.stringify(detail)}` : '';
  logOutput.textContent = `[${ts}] ${message}${payload}\n${logOutput.textContent}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error || response.statusText;
    throw new Error(error);
  }
  return data;
}

function renderStatus(state) {
  const plotterActive = !state.dryRun;
  const tiktokActive = !state.noTiktokRun;
  statusText.textContent = 'OK';
  dryRunText.textContent = plotterActive ? 'On' : 'Off';
  serialText.textContent = state.serialConnected ? 'Connected' : 'Disconnected';
  workerText.textContent = state.workerPaused ? 'Paused' : 'Running';
  tiktokText.textContent = tiktokActive ? 'On' : 'Off';
  dryRunToggle.checked = plotterActive;
  noTiktokToggle.checked = tiktokActive;
  renderPosition(state.position ?? null, state.positionUpdatedAt);
}

function renderPosition(position, updatedAt) {
  if (!position) {
    posX.textContent = '--';
    posY.textContent = '--';
    posZ.textContent = '--';
    posUpdated.textContent = '--';
    return;
  }

  posX.textContent = Number.isFinite(position.x) ? position.x.toFixed(2) : '--';
  posY.textContent = Number.isFinite(position.y) ? position.y.toFixed(2) : '--';
  posZ.textContent = Number.isFinite(position.z) ? position.z.toFixed(2) : '--';
  if (updatedAt) {
    const ts = new Date(updatedAt);
    posUpdated.textContent = ts.toLocaleTimeString();
  } else {
    posUpdated.textContent = '--';
  }
}

async function refreshStatus() {
  try {
    const status = await requestJson('/status');
    renderStatus(status);
    logLine('Status refreshed', {
      dryRun: status.dryRun,
      serialConnected: status.serialConnected,
      workerPaused: status.workerPaused,
    });
  } catch (error) {
    statusText.textContent = 'Error';
    logLine('Status failed', { error: error.message });
  }
}

async function refreshPosition() {
  try {
    const response = await requestJson('/plotter/position', { method: 'POST' });
    renderPosition(response.position, response.updatedAt);
    logLine('Position updated', response.position ?? {});
  } catch (error) {
    logLine('Position failed', { error: error.message });
  }
}

function buildCurlSnippets() {
  const dryRunPayload = JSON.stringify({ dryRun: !dryRunToggle.checked });
  curlDryRun.textContent = `curl -X POST ${baseUrl}/config/dry-run \\\n  -H 'Content-Type: application/json' \\\n  -d '${dryRunPayload}'`;

  const noTiktokPayload = JSON.stringify({ noTiktokRun: !noTiktokToggle.checked });
  curlNoTiktok.textContent = `curl -X POST ${baseUrl}/config/no-tiktok-run \\\n  -H 'Content-Type: application/json' \\\n  -d '${noTiktokPayload}'`;

  const connectPayload = {};
  if (portInput.value.trim()) {
    connectPayload.port = portInput.value.trim();
  }
  if (baudInput.value.trim()) {
    connectPayload.baud = Number(baudInput.value.trim());
  }

  const connectBody = Object.keys(connectPayload).length
    ? JSON.stringify(connectPayload)
    : '{}';

  curlConnect.textContent = `curl -X POST ${baseUrl}/plotter/connect \\\n  -H 'Content-Type: application/json' \\\n  -d '${connectBody}'`;

  curlDisconnect.textContent = `curl -X POST ${baseUrl}/plotter/disconnect`;

  const giftPayload = JSON.stringify({
    rowId: rowInput.value.trim() || 'row1',
    count: Number(countInput.value || 1),
  });
  curlGift.textContent = `curl -X POST ${baseUrl}/simulate/gift \\\n  -H 'Content-Type: application/json' \\\n  -d '${giftPayload}'`;

  curlPaper.textContent = `curl -X POST ${baseUrl}/paper/changed`;
  curlMapping.textContent = `curl -X POST ${baseUrl}/mapping/reload`;
  curlZero.textContent = `curl -X POST ${baseUrl}/plotter/zero`;
  curlPosition.textContent = `curl -X POST ${baseUrl}/plotter/position`;
}

async function toggleDryRun() {
  try {
    const payload = { dryRun: !dryRunToggle.checked };
    const response = await requestJson('/config/dry-run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logLine('Plotter active updated', response);
    await refreshStatus();
  } catch (error) {
    dryRunToggle.checked = !dryRunToggle.checked;
    logLine('Plotter active update failed', { error: error.message });
  }
  buildCurlSnippets();
}

async function toggleNoTiktokRun() {
  try {
    const payload = { noTiktokRun: !noTiktokToggle.checked };
    const response = await requestJson('/config/no-tiktok-run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logLine('TikTok active updated', response);
    await refreshStatus();
  } catch (error) {
    noTiktokToggle.checked = !noTiktokToggle.checked;
    logLine('TikTok active update failed', { error: error.message });
  }
  buildCurlSnippets();
}

async function sendGcode(lines) {
  const response = await requestJson('/plotter/gcode', {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });
  return response;
}

function formatMove(axis, distance, feedRate) {
  return ['G91', `G0 ${axis}${distance} F${feedRate}`, 'G90'];
}

connectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = {};
    if (portInput.value.trim()) {
      payload.port = portInput.value.trim();
    }
    if (baudInput.value.trim()) {
      payload.baud = Number(baudInput.value.trim());
    }
    const response = await requestJson('/plotter/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logLine('Connected', response);
    refreshStatus();
  } catch (error) {
    logLine('Connect failed', { error: error.message });
  }
});

disconnectBtn.addEventListener('click', async () => {
  try {
    const response = await requestJson('/plotter/disconnect', { method: 'POST' });
    logLine('Disconnected', response);
    refreshStatus();
  } catch (error) {
    logLine('Disconnect failed', { error: error.message });
  }
});

giftForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = {
      rowId: rowInput.value.trim() || 'row1',
      count: Number(countInput.value || 1),
    };
    const response = await requestJson('/simulate/gift', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logLine('Gift queued', response);
  } catch (error) {
    logLine('Gift failed', { error: error.message });
  }
});

paperChangedBtn.addEventListener('click', async () => {
  try {
    const response = await requestJson('/paper/changed', { method: 'POST' });
    logLine('Paper reset', response);
    refreshStatus();
  } catch (error) {
    logLine('Paper reset failed', { error: error.message });
  }
});

reloadMappingBtn.addEventListener('click', async () => {
  try {
    const response = await requestJson('/mapping/reload', { method: 'POST' });
    logLine('Mapping reloaded', response);
  } catch (error) {
    logLine('Mapping reload failed', { error: error.message });
  }
});

zeroPositionBtn.addEventListener('click', async () => {
  try {
    const response = await requestJson('/plotter/zero', { method: 'POST' });
    renderPosition(response.after ?? response.position ?? null, response.updatedAt);
    logLine('Zeroed position', response.after ?? response.position ?? response);
  } catch (error) {
    logLine('Zero position failed', { error: error.message });
  }
});

jogButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.getAttribute('data-jog');
    if (!action) return;
    const step = Number(jogStepInput.value || 0);
    const feedXY = Number(jogFeedXYInput.value || 0);
    const feedZ = Number(jogFeedZInput.value || 0);

    if (!Number.isFinite(step) || step <= 0) {
      logLine('Jog failed', { error: 'invalid step' });
      return;
    }
    if (!Number.isFinite(feedXY) || feedXY <= 0 || !Number.isFinite(feedZ) || feedZ <= 0) {
      logLine('Jog failed', { error: 'invalid feed rate' });
      return;
    }

    try {
      if (action === 'home') {
        const response = await sendGcode(['G28']);
        logLine('Homing', response);
        return;
      }
      if (action === 'zero') {
        const response = await requestJson('/plotter/zero', { method: 'POST' });
        renderPosition(response.after ?? response.position ?? null, response.updatedAt);
        logLine('Zeroed position', response.after ?? response.position ?? response);
        return;
      }

      let axis = '';
      let distance = 0;
      let feed = feedXY;
      if (action === 'x+') {
        axis = 'X';
        distance = step;
      } else if (action === 'x-') {
        axis = 'X';
        distance = -step;
      } else if (action === 'y+') {
        axis = 'Y';
        distance = step;
      } else if (action === 'y-') {
        axis = 'Y';
        distance = -step;
      } else if (action === 'z+') {
        axis = 'Z';
        distance = step;
        feed = feedZ;
      } else if (action === 'z-') {
        axis = 'Z';
        distance = -step;
        feed = feedZ;
      } else {
        return;
      }

      const lines = formatMove(axis, distance, feed);
      const response = await sendGcode(lines);
      logLine('Jog', { axis, distance, feed, ...response });
    } catch (error) {
      logLine('Jog failed', { error: error.message });
    }
  });
});

refreshBtn.addEventListener('click', refreshStatus);
refreshPositionBtn.addEventListener('click', refreshPosition);

clearLogBtn.addEventListener('click', () => {
  logOutput.textContent = '';
});

[portInput, baudInput, rowInput, countInput].forEach((input) => {
  input.addEventListener('input', buildCurlSnippets);
});

const sendButtons = document.querySelectorAll('[data-action]');
sendButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.getAttribute('data-action');
    if (!action) return;
    try {
      if (action === 'send-dryrun') {
        await toggleDryRun();
        return;
      }
      if (action === 'send-no-tiktok') {
        await toggleNoTiktokRun();
        return;
      }
      if (action === 'send-connect') {
        connectForm.requestSubmit();
        return;
      }
      if (action === 'send-disconnect') {
        disconnectBtn.click();
        return;
      }
      if (action === 'send-gift') {
        giftForm.requestSubmit();
        return;
      }
      if (action === 'send-paper') {
        paperChangedBtn.click();
        return;
      }
      if (action === 'send-mapping') {
        reloadMappingBtn.click();
        return;
      }
      if (action === 'send-zero') {
        zeroPositionBtn.click();
        return;
      }
      if (action === 'send-position') {
        refreshPosition();
        return;
      }
    } catch (error) {
      logLine('Action failed', { action, error: error.message });
    }
  });
});

dryRunToggle.addEventListener('change', toggleDryRun);
noTiktokToggle.addEventListener('change', toggleNoTiktokRun);

buildCurlSnippets();
refreshStatus();
