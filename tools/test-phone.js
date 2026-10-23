import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9282;

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--window-size=1280,800',
  '--disable-gpu',
  'http://localhost:8000/index.html'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await wait(3000);
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.url.includes('/index.html')) || tabs.find(t => t.type === 'page');
    if (!tab) {
      console.log('No lounge tab found');
      return;
    }
    console.log('Connected to tab:', tab.title);

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const cur = id++;
        const h = evt => {
          const res = JSON.parse(evt.data);
          if (res.id === cur) { ws.removeEventListener('message', h); resolve(res.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: cur, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    const logs = [];
    const errors = [];
    ws.addEventListener('message', evt => {
      const d = JSON.parse(evt.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        const line = d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' ');
        logs.push(line);
        if (d.params.type === 'error') errors.push(line);
      }
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push('EXCEPTION: ' + JSON.stringify(d.params.exceptionDetails));
      }
    });

    // Wait for stage to render
    await wait(3000);

    // Evaluate clean HUD structure
    const hudCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const topBar = document.getElementById('topBar');
        const brand = document.getElementById('brand');
        const coinVal = document.getElementById('coinVal')?.textContent;
        const clockVal = document.getElementById('clockVal')?.textContent;
        const fastTravel = document.getElementById('fastTravel');
        const tools = document.getElementById('tools');
        const phoneBtn = document.getElementById('phoneToggleBtn');
        const phoneDev = document.getElementById('phoneDevice');
        const emotesInRoot = document.querySelector('#bottom > #emotes');

        return {
          hasTopBar: !!topBar,
          hasBrand: !!brand,
          coins: coinVal,
          clock: clockVal,
          hasFastTravelInTop: !!fastTravel,
          hasToolsInTop: !!tools,
          hasPhoneBtn: !!phoneBtn,
          hasPhoneDev: !!phoneDev,
          phoneClosed: phoneDev?.classList.contains('phoneClosed'),
          emotesMovedToPhone: !emotesInRoot && !!document.querySelector('#phoneDevice #emotes')
        };
      })()`,
      returnByValue: true
    });

    console.log('HUD Check:', hudCheck.result.value);

    // Capture clean HUD screenshot
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('tools/lounge-clean-hud.png', Buffer.from(shot1.data, 'base64'));
    console.log('Saved tools/lounge-clean-hud.png');

    // Trigger Phone Open via pressing 'P'
    console.log('Dispatching Keydown "p" to open phone...');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'p', unmodifiedText: 'p', key: 'p', code: 'KeyP' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', text: 'p', unmodifiedText: 'p', key: 'p', code: 'KeyP' });
    await wait(800);

    // Verify phone is open
    const phoneOpenCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const phoneDev = document.getElementById('phoneDevice');
        const phoneBtn = document.getElementById('phoneToggleBtn');
        const phoneTime = document.getElementById('phoneTime')?.textContent;
        const warpCount = document.querySelectorAll('.pWarpTile').length;
        const appsCount = document.querySelectorAll('.phoneAppIcon').length;
        const emoteBtns = document.querySelectorAll('#phoneDevice #emotes button').length;
        const radioTitle = document.getElementById('ytTrackTitle')?.textContent;

        return {
          isOpen: phoneDev?.classList.contains('open'),
          btnActive: phoneBtn?.classList.contains('active'),
          phoneTime,
          warpCount,
          appsCount,
          emoteBtns,
          radioTitle
        };
      })()`,
      returnByValue: true
    });

    console.log('Phone Open Check:', phoneOpenCheck.result.value);

    // Capture phone open screenshot
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('tools/lounge-phone-open.png', Buffer.from(shot2.data, 'base64'));
    console.log('Saved tools/lounge-phone-open.png');

    // Test Emote button click via phone
    console.log('Clicking dance emote inside phone...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const danceBtn = document.querySelector('#phoneDevice #emotes button[data-e="dance"]');
        if (danceBtn) danceBtn.click();
        return !!danceBtn;
      })()`
    });
    await wait(500);

    // Test closing phone via Escape key
    console.log('Dispatching Escape key to close phone...');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await wait(600);

    const phoneClosedCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const phoneDev = document.getElementById('phoneDevice');
        return {
          isOpen: phoneDev?.classList.contains('open'),
          isClosed: phoneDev?.classList.contains('phoneClosed')
        };
      })()`,
      returnByValue: true
    });

    console.log('Phone Closed Check:', phoneClosedCheck.result.value);

    // Report errors
    console.log(`Test complete. Console errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    proc.kill();
  }
}

main();
