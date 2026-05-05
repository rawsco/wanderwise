export function pinIcon(bg: string, text: string, size = 30): string {
  const r = size / 2;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${bg}" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif">${text}</text>` +
    `</svg>`
  )}`;
}

export function startEndPinIcon(size = 30): string {
  const r = size / 2;
  const sq = Math.floor(size / 5);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<defs>` +
    `<pattern id="ck2" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${sq * 2}" height="${sq * 2}" fill="white"/>` +
    `<rect width="${sq}" height="${sq}" fill="#111"/>` +
    `<rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="#111"/>` +
    `</pattern>` +
    `<clipPath id="clc2"><circle cx="${r}" cy="${r}" r="${r - 1}"/></clipPath>` +
    `<clipPath id="cll2"><rect x="0" y="0" width="${r}" height="${size}"/></clipPath>` +
    `<clipPath id="clr2"><rect x="${r}" y="0" width="${r}" height="${size}"/></clipPath>` +
    `</defs>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#059669"/>` +
    `<rect x="${r}" y="0" width="${r}" height="${size}" fill="url(#ck2)" clip-path="url(#clc2)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif" stroke="#059669" stroke-width="2" paint-order="stroke">S</text>` +
    `</svg>`
  )}`;
}

export function checkerPinIcon(size = 30): string {
  const r = size / 2;
  const sq = Math.floor(size / 5);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<defs>` +
    `<pattern id="ck" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse">` +
    `<rect width="${sq * 2}" height="${sq * 2}" fill="white"/>` +
    `<rect width="${sq}" height="${sq}" fill="#111"/>` +
    `<rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="#111"/>` +
    `</pattern>` +
    `<clipPath id="cl"><circle cx="${r}" cy="${r}" r="${r - 1}"/></clipPath>` +
    `</defs>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="white" stroke="white" stroke-width="2.5"/>` +
    `<rect width="${size}" height="${size}" fill="url(#ck)" clip-path="url(#cl)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(0,0,0,0.15)" clip-path="url(#cl)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<text x="${r}" y="${r + 4}" text-anchor="middle" fill="white" font-size="${Math.floor(size * 0.4)}" font-weight="bold" font-family="Arial,sans-serif" stroke="#222" stroke-width="3" paint-order="stroke">E</text>` +
    `</svg>`
  )}`;
}

export function activityPinIcon(size = 22): string {
  const r = size / 2;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#fbbf24" stroke="white" stroke-width="2"/>` +
    `<circle cx="${r}" cy="${r}" r="${Math.max(2, Math.floor(size * 0.18))}" fill="white"/>` +
    `</svg>`
  )}`;
}

export function searchResultPinIcon(size = 28): string {
  const r = size / 2;
  const arm = Math.floor(size * 0.22);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#9333ea" stroke="white" stroke-width="2.5"/>` +
    `<path d="M${r} ${r - arm} v${arm * 2} M${r - arm} ${r} h${arm * 2}" stroke="white" stroke-width="2.5" stroke-linecap="round"/>` +
    `</svg>`
  )}`;
}
