// Adaptación solo en memoria: el JSON de origen no se modifica.
export function combineCatalog(records, photos = []) {
  if (!Array.isArray(records)) throw new Error('El catálogo debe ser una lista.');
  const codes = new Set();
  const images = new Map(photos.map((photo) => [photo.codigo, photo.imagen]));
  return records.map((record) => {
    if (typeof record.codigo !== 'string' || !/^\d{8}$/.test(record.codigo) || codes.has(record.codigo)) {
      throw new Error('El catálogo requiere códigos únicos de ocho dígitos como texto.');
    }
    codes.add(record.codigo);
    return {...record, nombre: record.producto, principioActivo: record.principio_activo, imagen: images.get(record.codigo) ?? `img/${record.codigo}.jpg`};
  });
}

export const needsReview = (product) => product.estado_cruce === 'Revisar nombre';
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchCatalog(products, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    // La concentración se busca tal como figura en la descripción original.
    const text = normalize([product.codigo, product.producto, product.principio_activo, product.laboratorio].join(' '));
    return terms.every((term) => text.includes(term));
  });
}
