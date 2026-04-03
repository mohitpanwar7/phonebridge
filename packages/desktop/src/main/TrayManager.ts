import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import { join } from 'path';

export class TrayManager {
  private tray: Tray | null = null;
  private isConnected = false;
  private cameras: Array<{ id: string; name: string }> = [];
  private onSwitchCamera?: (id: string) => void;
  private onDisconnect?: () => void;

  constructor(
    private getWindow: () => BrowserWindow | null,
  ) {}

  create() {
    // Use a small 16x16 icon; fall back to an empty image if not found
    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-disconnected.png'));
    } catch {
      icon = nativeImage.createEmpty();
    }
    if (icon.isEmpty()) {
      // Create a simple 16x16 placeholder icon (purple dot)
      icon = nativeImage.createFromDataURL(this.makeTrayIconDataURL(false));
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('PhoneBridge');
    this.updateMenu();

    this.tray.on('double-click', () => {
      const win = this.getWindow();
      if (win) {
        if (win.isVisible()) {
          win.focus();
        } else {
          win.show();
        }
      }
    });
  }

  setConnected(connected: boolean, cameras: Array<{ id: string; name: string }> = []) {
    this.isConnected = connected;
    this.cameras = cameras;
    this.updateIcon();
    this.updateMenu();
  }

  onCameraSwitch(handler: (id: string) => void) {
    this.onSwitchCamera = handler;
  }

  onDisconnectPhone(handler: () => void) {
    this.onDisconnect = handler;
  }

  private updateIcon() {
    if (!this.tray) return;
    const dataURL = this.makeTrayIconDataURL(this.isConnected);
    const icon = nativeImage.createFromDataURL(dataURL);
    this.tray.setImage(icon);
    this.tray.setToolTip(this.isConnected ? 'PhoneBridge — Connected' : 'PhoneBridge — Waiting for phone');
  }

  private updateMenu() {
    if (!this.tray) return;

    const cameraItems: Electron.MenuItemConstructorOptions[] = this.cameras.map((cam) => ({
      label: cam.name,
      click: () => this.onSwitchCamera?.(cam.id),
    }));

    const menu = Menu.buildFromTemplate([
      {
        label: this.isConnected ? '● Connected' : '○ Waiting for phone…',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          const win = this.getWindow();
          if (win) { win.show(); win.focus(); }
        },
      },
      { type: 'separator' },
      ...(this.cameras.length > 0
        ? [
            { label: 'Switch Camera', submenu: cameraItems } as Electron.MenuItemConstructorOptions,
            { type: 'separator' as const },
          ]
        : []),
      ...(this.isConnected
        ? [
            {
              label: 'Disconnect Phone',
              click: () => this.onDisconnect?.(),
            } as Electron.MenuItemConstructorOptions,
            { type: 'separator' as const },
          ]
        : []),
      {
        label: 'Quit PhoneBridge',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  private makeTrayIconDataURL(connected: boolean): string {
    // 16×16 SVG circle — green when connected, grey when not
    const color = connected ? '#22c55e' : '#71717a';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="${color}"/>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}
