/**
 * MIDI DAW - Mobile to PC Network MIDI Bridge (Node.js)
 * -----------------------------------------------------
 * Requirements:
 *   npm install ws easymidi
 *
 * Usage:
 *   node midi_bridge.js
 */

const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer || WebSocket;
const os = require('os');

let easymidi;
let midiOutput;

try {
  easymidi = require('easymidi');
  const outputs = easymidi.getOutputs();
  console.log('[*] Available PC MIDI Outputs:', outputs);
  if (outputs.length > 0) {
    const chosen = outputs.find(p => p.toLowerCase().includes('loopmidi')) || outputs[0];
    midiOutput = new easymidi.Output(chosen);
    console.log(`[*] Connected to MIDI Port: '${chosen}'`);
  } else {
    try {
      midiOutput = new easymidi.Output('MobileMidiDaw', true);
      console.log("[*] Created virtual MIDI port: 'MobileMidiDaw'");
    } catch {
      console.log('[!] No MIDI outputs found. Install loopMIDI on Windows for virtual MIDI.');
    }
  }
} catch {
  console.log('[!] Note: easymidi not installed. Console logger mode enabled.');
  console.log('    To send real MIDI to DAWs, run: npm install easymidi');
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });
const localIp = getLocalIp();

console.log('='.repeat(60));
console.log('  MIDI DAW - Node.js PC Bridge Server');
console.log('='.repeat(60));
console.log(`[*] Server running on: ws://${localIp}:${PORT}`);
console.log(`[*] Enter this IP into the mobile app: ${localIp}`);
console.log(`[*] Port: ${PORT}`);
console.log('='.repeat(60));

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`\n[+] Mobile device connected from ${ip}`);

  ws.on('message', (message) => {
    try {
      // FAST PATH: Direct raw binary MIDI message
      if (Buffer.isBuffer(message) && message.length >= 3) {
        const status = message[0];
        const note = message[1];
        const vel = message[2];
        const cmd = status & 0xf0;
        const channel = status & 0x0f;

        if (midiOutput) {
          if (cmd === 0x90) {
            midiOutput.send(vel > 0 ? 'noteon' : 'noteoff', { note, velocity: vel, channel });
          } else if (cmd === 0x80) {
            midiOutput.send('noteoff', { note, velocity: 0, channel });
          } else if (cmd === 0xb0) {
            midiOutput.send('cc', { controller: note, value: vel, channel });
          } else if (cmd === 0xe0) {
            const pitchVal = (vel << 7) | note;
            midiOutput.send('pitch', { value: pitchVal, channel });
          }
        }
        return;
      }

      const data = JSON.parse(message.toString());
      const channel = (data.channel || 1) - 1;

      if (data.type === 'noteOn') {
        if (midiOutput) {
          midiOutput.send('noteon', {
            note: data.note,
            velocity: data.velocity || 100,
            channel: channel,
          });
        }
        console.log(`  -> Note ON  | Ch:${channel + 1} Note:${data.note} Vel:${data.velocity}`);
      } else if (data.type === 'noteOff') {
        if (midiOutput) {
          midiOutput.send('noteoff', {
            note: data.note,
            velocity: 0,
            channel: channel,
          });
        }
        console.log(`  -> Note OFF | Ch:${channel + 1} Note:${data.note}`);
      } else if (data.type === 'pitchBend') {
        if (midiOutput) {
          midiOutput.send('pitch', {
            value: data.value || 8192,
            channel: channel,
          });
        }
      } else if (data.type === 'controlChange') {
        if (midiOutput) {
          midiOutput.send('cc', {
            controller: data.controller,
            value: data.value,
            channel: channel,
          });
        }
        console.log(`  -> CC       | Ch:${channel + 1} CC:${data.controller} Val:${data.value}`);
      }
    } catch (err) {
      console.error('[!] Error parsing MIDI:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Mobile device disconnected (${ip})`);
  });
});
