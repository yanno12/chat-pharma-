'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Props = {
  id: string;
  medicine: string;
  quantity: number;
  en: boolean;
  onChanged: (quantity: number, updatedAt: string) => void;
};

export default function StockQuantity({
  id,
  medicine,
  quantity,
  en,
  onChanged,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);

  const t = (fr: string, english: string) => en ? english : fr;

  async function adjust(delta: number) {
    const next = quantity + delta;
    if (locked.current || next < 0 || next > 2147483647) return;

    locked.current = true;
    setSaving(true);
    setMessage('');

    try {
      if (!supabase) {
        throw new Error(
          t('Supabase n’est pas configuré.', 'Supabase is not configured.')
        );
      }

      const { data, error } = await supabase
        .from('inventory')
        .update({ quantity: next })
        .eq('id', id)
        .eq('quantity', quantity)
        .select('quantity,updated_at')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const latest = await supabase
          .from('inventory')
          .select('quantity,updated_at')
          .eq('id', id)
          .maybeSingle();

        if (latest.error) throw latest.error;

        if (!latest.data) {
          throw new Error(
            t(
              'Stock inaccessible. Actualisez la page.',
              'Stock unavailable. Refresh the page.'
            )
          );
        }

        onChanged(latest.data.quantity, latest.data.updated_at);
        setMessage(
          t(
            'Le stock a changé ailleurs. Quantité actualisée ; réessayez.',
            'Stock changed elsewhere. Quantity refreshed; please try again.'
          )
        );
        return;
      }

      onChanged(data.quantity, data.updated_at);
      setMessage(t('Quantité enregistrée.', 'Quantity saved.'));
    } catch (error) {
      setMessage(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : t('Échec de l’enregistrement.', 'Save failed.')
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return (
    <div style={{ margin: '18px 0' }}>
      <p>{t('Quantité disponible', 'Available quantity')}</p>

      <div
        role="group"
        aria-label={`${t('Ajuster le stock', 'Adjust stock')}: ${medicine}`}
        aria-busy={saving}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {[-10, -1].map(delta => (
          <button
            key={delta}
            type="button"
            disabled={saving || quantity + delta < 0}
            aria-label={`${t('Diminuer de', 'Decrease by')} ${-delta}`}
            onClick={() => void adjust(delta)}
          >
            {delta === -1 ? '−' : '−10'}
          </button>
        ))}

        <output
          aria-label={t('Quantité actuelle', 'Current quantity')}
          style={{
            minWidth: 36,
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {quantity}
        </output>

        {[1, 10].map(delta => (
          <button
            key={delta}
            type="button"
            disabled={saving || quantity + delta > 2147483647}
            aria-label={`${t('Augmenter de', 'Increase by')} ${delta}`}
            onClick={() => void adjust(delta)}
          >
            {delta === 1 ? '+' : '+10'}
          </button>
        ))}
      </div>

      <p role="status" style={{ fontSize: 12 }}>
        {saving ? t('Enregistrement…', 'Saving…') : message}
      </p>
    </div>
  );
}
