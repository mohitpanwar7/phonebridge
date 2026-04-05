/**
 * TunnelManager — creates a Cloudflare Quick Tunnel to expose the signaling
 * WebSocket server over the internet. Uses `cloudflared` binary.
 *
 * Quick tunnels require no Cloudflare account — just run cloudflared and get
 * a temporary *.trycloudflare.com URL.
 */
import { execFile, type ChildProcess } from 'child_process';
import { existsSync, createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import https from 'https';

const CLOUDFLARED_URL_WIN = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const CLOUDFLARED_URL_MAC = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
const CLOUDFLARED_URL_LINUX = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

export class TunnelManager {
  private process: ChildProcess | null = null;
  private _url: string | null = null;
  private _running = false;
  private binaryPath: string;

  constructor() {
    const binDir = join(app.getPath('userData'), 'bin');
    if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

    const ext = process.platform === 'win32' ? '.exe' : '';
    this.binaryPath = join(binDir, `cloudflared${ext}`);
  }

  get url(): string | null { return this._url; }
  get running(): boolean { return this._running; }

  /** Download cloudflared binary if not already present. */
  async ensureBinary(): Promise<boolean> {
    if (existsSync(this.binaryPath)) return true;

    const downloadUrl =
      process.platform === 'win32' ? CLOUDFLARED_URL_WIN :
      process.platform === 'darwin' ? CLOUDFLARED_URL_MAC :
      CLOUDFLARED_URL_LINUX;

    console.log('[Tunnel] Downloading cloudflared...');
    try {
      await this.download(downloadUrl, this.binaryPath);
      // Make executable on Unix
      if (process.platform !== 'win32') {
        const { chmodSync } = require('fs');
        chmodSync(this.binaryPath, 0o755);
      }
      console.log('[Tunnel] cloudflared downloaded');
      return true;
    } catch (err) {
      console.error('[Tunnel] Download failed:', err);
      return false;
    }
  }

  private download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (u: string) => {
        https.get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return follow(res.headers.location!);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const file = createWriteStream(dest);
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', reject);
        }).on('error', reject);
      };
      follow(url);
    });
  }

  /** Start a quick tunnel for the given local port. Returns the public URL. */
  async start(port: number): Promise<string | null> {
    if (this._running) return this._url;

    const hasBinary = await this.ensureBinary();
    if (!hasBinary) return null;

    return new Promise((resolve) => {
      const args = ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'];
      console.log(`[Tunnel] Starting: ${this.binaryPath} ${args.join(' ')}`);

      this.process = execFile(this.binaryPath, args, { timeout: 0 });
      this._running = true;

      let resolved = false;
      const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

      this.process.stderr?.on('data', (data: string) => {
        const text = data.toString();
        // cloudflared prints the URL to stderr
        const match = text.match(urlRegex);
        if (match && !resolved) {
          resolved = true;
          // Convert https URL to wss URL for WebSocket
          this._url = match[0].replace('https://', 'wss://');
          console.log(`[Tunnel] Public URL: ${this._url}`);
          resolve(this._url);
        }
      });

      this.process.stdout?.on('data', (data: string) => {
        const text = data.toString();
        const match = text.match(urlRegex);
        if (match && !resolved) {
          resolved = true;
          this._url = match[0].replace('https://', 'wss://');
          console.log(`[Tunnel] Public URL: ${this._url}`);
          resolve(this._url);
        }
      });

      this.process.on('close', (code) => {
        console.log(`[Tunnel] Process exited with code ${code}`);
        this._running = false;
        this._url = null;
        if (!resolved) resolve(null);
      });

      this.process.on('error', (err) => {
        console.error('[Tunnel] Process error:', err);
        this._running = false;
        if (!resolved) resolve(null);
      });

      // Timeout after 30s if URL not found
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('[Tunnel] Timed out waiting for URL');
          resolve(null);
        }
      }, 30000);
    });
  }

  /** Stop the tunnel. */
  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this._running = false;
    this._url = null;
    console.log('[Tunnel] Stopped');
  }
}
