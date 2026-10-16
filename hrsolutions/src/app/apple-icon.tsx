import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#2563eb',
          borderRadius: 42,
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <svg width="124" height="124" viewBox="0 0 24 24" fill="none">
          <path d="M12 2.2 3.6 9.8c-.4.3-.3.9.2 1.1l8.2 3.3 8.2-3.3c.5-.2.6-.8.2-1.1L12 2.2Z" fill="white" />
          <path d="m3.6 11.8 7.8 9.8c.2.2.4.1.4-.2v-6.3l-7.6-3.3c-.4-.2-.8 0-.6.4Z" fill="white" fillOpacity="0.82" />
          <path d="m20.4 11.8-7.8 9.8c-.2.2-.4.1-.4-.2v-6.3l7.6-3.3c.4-.2.8 0 .6.4Z" fill="white" fillOpacity="0.6" />
        </svg>
      </div>
    ),
    size
  );
}
