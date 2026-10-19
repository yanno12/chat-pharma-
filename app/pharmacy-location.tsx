'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  pharmacyId: string;
  en: boolean;
  onSaved: () => void;
};

export default function PharmacyLocation({
  pharmacyId,
  en,
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);

  const t = (fr: string, english: string) => en ? english : fr;

  function captureLocation() {
    if (locked.current) return;

    if (!navigator.geolocation) {
      setMessage(
        t(
          'Votre navigateur ne permet pas la géolocalisation.',
          'Your browser does not support geolocation.'
        )
      );
      return;
    }

    locked.current = true;
    setBusy(true);
    setMessage(t('Recherche de votre position…', 'Finding your location…'));

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          if (!supabase) {
            throw new Error(
              t('Supabase n’est pas configuré.', 'Supabase is not configured.')
            );
          }

          const { error } = await supabase
            .from('pharmacies')
            .update({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            })
            .eq('id', pharmacyId)
            .select('id')
            .single();

          if (error) throw error;

          onSaved();

          setMessage(
            t(
              `Position enregistrée, précision estimée : ${Math.round(
                position.coords.accuracy
              )} m. Une validation administrateur est nécessaire si la position a changé.`,
              `Location saved, estimated accuracy: ${Math.round(
                position.coords.accuracy
              )} m. Admin approval is required if the location changed.`
            )
          );
        } catch (error) {
          setMessage(
            error && typeof error === 'object' && 'message' in error
              ? String(error.message)
              : t('Impossible d’enregistrer la position.', 'Unable to save location.')
          );
        } finally {
          locked.current = false;
          setBusy(false);
        }
      },
      error => {
        setMessage(
          error.code === 1
            ? t(
                'Autorisez la localisation dans les réglages de votre navigateur, puis réessayez.',
                'Allow location access in your browser settings, then try again.'
              )
            : t(
                'Position indisponible. Vérifiez votre connexion et réessayez, idéalement depuis un téléphone.',
                'Location unavailable. Check your connection and try again, ideally from a phone.'
              )
        );

        locked.current = false;
        setBusy(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  }

  return (
    <div className="panel">
      <h2>{t('Localisation de la pharmacie', 'Pharmacy location')}</h2>

      <p>
        {t(
          'Utilisez ce bouton uniquement lorsque vous êtes physiquement à la pharmacie. Votre position sera enregistrée et publiée après validation.',
          'Use this button only while physically at the pharmacy. Your location will be saved and published after approval.'
        )}
      </p>

      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={captureLocation}
      >
        {busy
          ? t('Localisation…', 'Locating…')
          : t('Utiliser ma position actuelle', 'Use my current location')}
      </button>

      <p role="status">{message}</p>
    </div>
  );
}
