import QRCode from 'qrcode';

export class QRGenerator {
  static async toDataURL(data: string): Promise<string> {
    return QRCode.toDataURL(data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }
}
