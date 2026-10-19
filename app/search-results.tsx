'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { currencyForCountry } from '@/lib/countries';

export type PatientPosition = {
  lat: number;
  lng: number;
};

export type PharmacySearchResult = {
  stock_id: string;
  medicine: string;
  dosage: string;
  price: number | null;
  updated_at: string;
  pharmacy_id: string;
  pharmacy: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
};

type Point = [number, number];

type MapInstance = {
  setView: (point: Point, zoom: number) => MapInstance;
  fitBounds: (
    points: Point[],
    options: { padding: Point; maxZoom: number }
  ) => MapInstance;
  remove: () => void;
};

type LeafletLibrary = {
  map: (container: HTMLDivElement) => MapInstance;
  tileLayer: (
    url: string,
    options: Record<string, unknown>
  ) => {
    addTo: (map: MapInstance) => unknown;
  };
  circleMarker: (
    point: Point,
    options: Record<string, unknown>
  ) => {
    addTo: (map: MapInstance) => {
      bindPopup: (content: HTMLElement) => unknown;
    };
  };
};

type Props = {
  results: PharmacySearchResult[];
  en: boolean;
  patientPosition: PatientPosition | null;
  busy: boolean;
  onLocate: () => void;
};

function hasCoordinates(result: PharmacySearchResult) {
  return (
    result.latitude != null &&
    result.longitude != null &&
    Number.isFinite(result.latitude) &&
    Number.isFinite(result.longitude)
  );
}

export default function SearchResults({
  results,
  en,
  patientPosition,
  busy,
  onLocate,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const t = (fr: string, english: string) => en ? english : fr;

  const pharmacies = Array.from(
    new Map(
      results
        .filter(hasCoordinates)
        .map(result => [result.pharmacy_id, result] as const)
    ).values()
  );

  useEffect(() => {
    if (!ready || !container.current) return;

    const leaflet = (
      window as unknown as { L?: LeafletLibrary }
    ).L;

    if (!leaflet) {
      setMapError(true);
      return;
    }

    const located = Array.from(
      new Map(
        results
          .filter(hasCoordinates)
          .map(result => [result.pharmacy_id, result] as const)
      ).values()
    );

    if (!located.length) return;

    const map = leaflet.map(container.current).setView([9, 0], 5);

    leaflet.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }
    ).addTo(map);

    const points: Point[] = [];

    for (const pharmacy of located) {
      const point: Point = [
        pharmacy.latitude!,
        pharmacy.longitude!,
      ];

      points.push(point);

      // DOM textContent prevents pharmacy-provided text becoming HTML.
      const popup = document.createElement('div');

      const title = document.createElement('strong');
      title.textContent = pharmacy.pharmacy;

      const address = document.createElement('p');
      address.textContent = `${pharmacy.address}, ${pharmacy.city}`;

      const directions = document.createElement('a');
      directions.textContent = en
        ? 'Get directions'
        : 'Obtenir un itinéraire';
      directions.href =
        `https://www.google.com/maps/dir/?api=1&destination=${point[0]},${point[1]}`;
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';

      popup.append(title, address, directions);

      leaflet.circleMarker(point, {
        radius: 9,
        color: '#007f6a',
        fillColor: '#009f83',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map).bindPopup(popup);
    }

    if (patientPosition) {
      const point: Point = [
        patientPosition.lat,
        patientPosition.lng,
      ];

      const popup = document.createElement('span');
      popup.textContent = en ? 'Your position' : 'Votre position';

      leaflet.circleMarker(point, {
        radius: 8,
        color: '#064b78',
        fillColor: '#064b78',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map).bindPopup(popup);

      points.push(point);
    }

    map.fitBounds(points, {
      padding: [24, 24],
      maxZoom: 14,
    });

    return () => map.remove();
  }, [ready, results, patientPosition, en]);

  return (
    <>
      <div className="panel">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={onLocate}
        >
          {busy
            ? t('Veuillez patienter…', 'Please wait…')
            : patientPosition
              ? t('Actualiser ma position', 'Refresh my location')
              : t('Près de moi', 'Near me')}
        </button>

        <p>
          {patientPosition
            ? t(
                'Résultats triés par distance estimée. Les pharmacies sans coordonnées apparaissent en dernier.',
                'Results sorted by estimated distance. Pharmacies without coordinates appear last.'
              )
            : t(
                'Autorisez votre localisation pour afficher les pharmacies les plus proches.',
                'Allow location access to show the nearest pharmacies.'
              )}
        </p>

        <small>
          {t(
            'Distances à vol d’oiseau, pas distances routières. Votre position n’est pas enregistrée dans les tables de l’application.',
            'Distances are straight-line estimates, not road distances. Your position is not saved in the app’s database tables.'
          )}
        </small>
      </div>

      {pharmacies.length > 0 && (
        <div className="panel">
          <h2>{t('Carte des pharmacies', 'Pharmacy map')}</h2>

          <p>
            {t(
              'Vert : pharmacies. Bleu : votre position.',
              'Green: pharmacies. Blue: your position.'
            )}
          </p>

          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
            crossOrigin="anonymous"
          />

          <Script
            id="pharmastock-leaflet"
            src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
            crossOrigin="anonymous"
            strategy="afterInteractive"
            onReady={() => setReady(true)}
            onError={() => setMapError(true)}
          />

          {mapError ? (
            <p role="status">
              {t(
                'La carte est indisponible. La liste et les liens d’itinéraire restent utilisables.',
                'The map is unavailable. The list and directions links still work.'
              )}
            </p>
          ) : (
            <>
              {!ready && (
                <p role="status">
                  {t('Chargement de la carte…', 'Loading map…')}
                </p>
              )}

              <div
                ref={container}
                aria-label={t('Carte des pharmacies', 'Pharmacy map')}
                style={{
                  height: 360,
                  width: '100%',
                  borderRadius: 12,
                  isolation: 'isolate',
                }}
              />
            </>
          )}
        </div>
      )}

      {!results.length && (
        <p className="empty">
          {t(
            'Aucun stock trouvé. Essayez une autre ville ou une autre orthographe.',
            'No stock found. Try another city or spelling.'
          )}
        </p>
      )}

      <div className="cards">
        {results.map(result => (
          <article className="card" key={result.stock_id}>
            <span className="badge">
              {t('En stock déclaré', 'Reported in stock')}
            </span>

            <h3>
              {result.medicine}
              <small>{result.dosage}</small>
            </h3>

            <p className="price">
  {result.price === null
    ? t('Prix à confirmer', 'Confirm price')
    : `${result.price.toLocaleString(
        en ? 'en' : 'fr'
      )} ${currencyForCountry(result.country)}`}
</p>
            <strong>{result.pharmacy}</strong>
            <p>{result.address}, {result.city}</p>

            {result.distance_km != null && (
              <p>
                {t('À environ', 'Approximately')}{' '}
                {result.distance_km.toLocaleString(
                  en ? 'en' : 'fr',
                  { maximumFractionDigits: 1 }
                )}{' '}
                km
              </p>
            )}

            {!hasCoordinates(result) && (
              <p className="muted">
                {t(
                  'Localisation non renseignée.',
                  'Location not provided.'
                )}
              </p>
            )}

            <p className="muted">
              {t('Mis à jour', 'Updated')}:{' '}
              {new Date(result.updated_at).toLocaleString(
                en ? 'en-GB' : 'fr-FR'
              )}
            </p>

            <a className="contact" href={`tel:${result.phone}`}>
              {t('Appeler', 'Call')} {result.phone}
            </a>

            {hasCoordinates(result) && (
              <a
                className="contact"
                href={`https://www.google.com/maps/dir/?api=1&destination=${result.latitude},${result.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', marginTop: 12 }}
              >
                {t('Obtenir un itinéraire', 'Get directions')}
              </a>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
