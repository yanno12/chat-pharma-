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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');

  const locked = useRef(false);
  const editBase = useRef(quantity);

  const t = (fr: string, english: string) => en ? english : fr;

  function startEditing() {
    if (locked.current) return;
    editBase.current = quantity;
    setDraft(String(quantity));
    setMessage('');
    setEditing(true);
  }

  async function saveQuantity(next: number, expected: number) {
    if (locked.current) return;

    if (!Number.isInteger(next) || next < 0 || next > 2147483647) {
      setMessage(
        t(
          'Saisissez un nombre entier entre 0 et 2147483647.',
          'Enter a whole number between 0 and 2147483647.'
        )
      );
      return;
    }

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
        .eq('quantity', expected)
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
        setEditing(false);
        setMessage(
          t(
            'Le stock a changé ailleurs. Quantité actualisée ; réessayez.',
            'Stock changed elsewhere. Quantity refreshed; please try again.'
          )
        );
        return;
      }

      onChanged(data.quantity, data.updated_at);
      setEditing(false);
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

  function saveDraft() {
    const value = draft.trim();

    if (!/^\d+$/.test(value)) {
      setMessage(
        t(
          'Saisissez un nombre entier positif ou zéro.',
          'Enter a positive whole number or zero.'
        )
      );
      return;
    }

    void saveQuantity(Number(value), editBase.current);
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
        <button
          type="button"
          disabled={saving || editing || quantity === 0}
          aria-label={t('Diminuer de 1', 'Decrease by 1')}
          onClick={() => void saveQuantity(quantity - 1, quantity)}
        >
          −
        </button>

        {editing ? (
          <input
            autoFocus
            type="number"
            min={0}
            max={2147483647}
            step={1}
            inputMode="numeric"
            value={draft}
            disabled={saving}
            aria-label={t('Nouvelle quantité', 'New quantity')}
            onChange={event => setDraft(event.target.value)}
            onFocus={event => event.currentTarget.select()}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                saveDraft();
              }

              if (event.key === 'Escape' && !saving) {
                setEditing(false);
                setMessage('');
              }
            }}
            style={{
              width: 110,
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 700,
            }}
          />
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={startEditing}
            aria-label={`${t(
              'Modifier la quantité',
              'Edit quantity'
            )}: ${quantity}`}
            title={t('Cliquer pour modifier', 'Click to edit')}
            style={{
              minWidth: 64,
              fontSize: 20,
              fontWeight: 700,
              borderStyle: 'dashed',
            }}
          >
            {quantity}
          </button>
        )}

        <button
          type="button"
          disabled={saving || editing || quantity >= 2147483647}
          aria-label={t('Augmenter de 1', 'Increase by 1')}
          onClick={() => void saveQuantity(quantity + 1, quantity)}
        >
          +
        </button>

        {editing && (
          <>
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={saveDraft}
            >
              {t('Enregistrer', 'Save')}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setMessage('');
              }}
            >
              {t('Annuler', 'Cancel')}
            </button>
          </>
        )}
      </div>

      {!editing && (
        <p style={{ fontSize: 12 }}>
          {t(
            'Cliquez sur la quantité pour la modifier.',
            'Click the quantity to edit it.'
          )}
        </p>
      )}

      <p role="status" style={{ fontSize: 12 }}>
        {saving ? t('Enregistrement…', 'Saving…') : message}
      </p>
    </div>
  );
}
