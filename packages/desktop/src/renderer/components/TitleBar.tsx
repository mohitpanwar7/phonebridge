import React from 'react';

interface TitleBarProps {
  themeMode: 'dark' | 'light';
}

const TitleBar: React.FC<TitleBarProps> = ({ themeMode }) => {
  const isDark = themeMode === 'dark';

  return (
    <div
      style={{
        height: 38,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        backgroundColor: 'transparent',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      } as React.CSSProperties}
    >
      {/* Traffic light dots */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <button
          onClick={() => window.phoneBridge.windowClose()}
          title="Close"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: isDark ? '#cc4c42' : '#ff5f57',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
        />
        <button
          onClick={() => window.phoneBridge.windowMinimize()}
          title="Minimize"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: isDark ? '#cc9822' : '#ffbd2e',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
        />
        <button
          onClick={() => window.phoneBridge.windowMaximize()}
          title="Maximize"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: isDark ? '#1fa033' : '#28c840',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
        />
      </div>

      {/* Centered app title */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
          letterSpacing: 0.5,
          pointerEvents: 'none',
        }}
      >
        PhoneBridge
      </span>
    </div>
  );
};

export default TitleBar;
