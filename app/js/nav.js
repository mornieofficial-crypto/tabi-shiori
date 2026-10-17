// ナビ起動用のURL。住所だけの場所はまず検索で確認させ、座標があるときだけカーナビを直接開く。
export function navTargets(place) {
  const hasCoords = Number.isFinite(place.lat) && Number.isFinite(place.lon);
  const query = [place.location, place.name].filter(Boolean).join(' ');
  const q = encodeURIComponent(query);
  return {
    hasCoords,
    yahooCar: hasCoords
      ? `yjcarnavi://navi/select?lat=${place.lat}&lon=${place.lon}&name=${encodeURIComponent(place.name)}`
      : null,
    yahooMap: `https://map.yahoo.co.jp/search?q=${q}`,
    google: `https://www.google.com/maps/search/?api=1&query=${hasCoords ? `${place.lat},${place.lon}` : q}`,
    apple: hasCoords
      ? `https://maps.apple.com/?ll=${place.lat},${place.lon}&q=${encodeURIComponent(place.name)}`
      : `https://maps.apple.com/?q=${q}`,
  };
}
