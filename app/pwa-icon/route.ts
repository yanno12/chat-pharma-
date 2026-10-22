import { ImageResponse } from 'next/og';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestedSize = new URL(request.url).searchParams.get('size');

  const size = requestedSize === '192'
    ? 192
    : requestedSize === '180'
      ? 180
      : 512;

  const logo = await readFile(
    join(process.cwd(), 'public', 'logo.png')
  );

  const image = createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
      },
    },
    createElement('img', {
      src: `data:image/png;base64,${logo.toString('base64')}`,
      width: size - 24,
      height: size - 24,
      style: {
        objectFit: 'contain',
      },
    })
  );

  return new ImageResponse(image, {
    width: size,
    height: size,
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
