'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { countries, currencyForCountry } from '@/lib/countries';
import StockQuantity from './stock-quantity';
import PharmacyLocation from './pharmacy-location';
import SearchResults, {
  type PatientPosition,
  type PharmacySearchResult,
} from './search-results';

type Pharmacy = {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  license_number: string;
  approved: boolean;
};

type Stock = {
  id: string;
  medicine: string;
  dosage: string;
  quantity: number;
  price: number | null;
  updated_at: string;
};

type SearchQuery = {
  term: string;
  country_code: string;
  city_query: string;
};

type PageTab = 'search' | 'pharmacy' | 'admin' | 'reset' | 'account';
type WorkspaceTab = 'dashboard' | 'inventory' | 'alerts' | 'profile';
type IconName = 'grid' | 'box' | 'alert' | 'profile' | 'globe' | 'plus';

const iconPaths: Record<IconName, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  box: 'M12 3l9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5',
  alert: 'M12 8v5 M12 17h.01 M10.3 3.8L2.2 18a2 2 0 001.7 3h16.2a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z',
  profile: 'M8 21V3h8v18 M4 21V9h4 M16 9h4v12 M3 21h18 M11 7h2 M11 11h2 M11 15h2',
  globe: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3 12h18 M12 3a18 18 0 010 18 18 18 0 010-18z',
  plus: 'M12 5v14 M5 12h14',
};

const terms = [
  [
    'Vous devez être autorisé à représenter la pharmacie et fournir des informations professionnelles exactes.',
    'You must be authorised to represent the pharmacy and provide accurate professional information.',
  ],
  [
    'Vous êtes responsable de la mise à jour des stocks, prix, coordonnées et informations publiées.',
    'You are responsible for keeping stock, prices, contact details and published information up to date.',
  ],
  [
    'Votre profil professionnel, vos stocks et votre localisation enregistrée peuvent être visibles publiquement après validation.',
    'Your business profile, inventory and saved pharmacy location may be publicly visible after approval.',
  ],
  [
    'Les disponibilités sont indicatives et doivent être confirmées auprès de la pharmacie avant déplacement.',
    'Availability is indicative and should be confirmed with the pharmacy before travelling.',
  ],
  [
    'PharmaStock ne fournit ni diagnostic, ni prescription, ni vente de médicaments en ligne.',
    'PharmaStock does not provide diagnoses, prescriptions or online medicine sales.',
  ],
  [
    'Les annonces trompeuses, les activités illégales et les usages abusifs peuvent entraîner la suspension du compte.',
    'Misleading listings, illegal activities and misuse may result in account suspension.',
  ],
];

function normalise(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);
}

function countryName(code: string, en: boolean) {
  const country = countries.find(item => item[0] === code);
  return country ? country[en ? 2 : 1] : code;
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

async function readInventory(pharmacyId: string): Promise<Stock[]> {
  if (!supabase) return [];

  const items: Stock[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('medicine')
      .order('id')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    items.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
  }

  return items;
}

async function readPharmacies(): Promise<Pharmacy[]> {
  if (!supabase) return [];

  const items: Pharmacy[] = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('*')
      .order('created_at')
      .order('id')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    items.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
  }

  return items;
}

type WorkspaceProps = {
  pharmacy: Pharmacy | null;
  stock: Stock[];
  en: boolean;
  busy: boolean;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddStock: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onQuantityChanged: (
    id: string,
    quantity: number,
    updatedAt: string
  ) => void;
  onMarkOut: (id: string) => void;
  onDelete: (id: string) => void;
  onLocationSaved: () => void;
  onPublic: () => void;
  onAccount: () => void;
  onSignOut: () => void;
};

function PharmacyWorkspace({
  pharmacy,
  stock,
  en,
  busy,
  onSaveProfile,
  onAddStock,
  onQuantityChanged,
  onMarkOut,
  onDelete,
  onLocationSaved,
  onPublic,
  onAccount,
  onSignOut,
}: WorkspaceProps) {
  const [active, setActive] = useState<WorkspaceTab>('dashboard');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const t = (fr: string, english: string) => en ? english : fr;
  const screen = pharmacy ? active : 'profile';
  const locale = en ? 'en-GB' : 'fr-FR';
  const currency = currencyForCountry(pharmacy?.country ?? 'TG');

  const lowStock = stock.filter(item =>
    item.quantity > 0 && item.quantity <= 5
  );
  const outOfStock = stock.filter(item => item.quantity === 0);
  const totalUnits = stock.reduce((sum, item) => sum + item.quantity, 0);

  const filtered = stock.filter(item =>
    normalise(`${item.medicine} ${item.dosage}`)
      .includes(normalise(query))
  );

  const recent = [...stock]
    .sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 5);

  function openInventory(name = '') {
    setQuery(name);
    setActive('inventory');
  }

  function openAdd() {
    setShowAdd(true);
    openInventory();
  }

  const navigation: {
    id: WorkspaceTab;
    label: string;
    icon: IconName;
  }[] = [
    { id: 'dashboard', label: t('Tableau de bord', 'Dashboard'), icon: 'grid' },
    { id: 'inventory', label: t('Inventaire', 'Inventory'), icon: 'box' },
    { id: 'alerts', label: t('Alertes', 'Alerts'), icon: 'alert' },
    { id: 'profile', label: t('Profil', 'Profile'), icon: 'profile' },
  ];

  return (
    <section className="workspace">
      <aside className="workspace-sidebar">
        <div className="sidebar-brand">
          <strong>PharmaStock</strong>
          <span>{t('Pro · Gestion', 'Pro · Management')}</span>
        </div>

        <nav aria-label={t('Navigation pharmacie', 'Pharmacy navigation')}>
          {navigation.map(item => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? 'selected' : ''}
              aria-current={screen === item.id ? 'page' : undefined}
              disabled={!pharmacy && item.id !== 'profile'}
              onClick={() => setActive(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" onClick={onAccount}>
            <Icon name="profile" />
            {t('Mon compte', 'My account')}
          </button>
          <button type="button" onClick={onPublic}>
            <Icon name="globe" />
            {t('Site public', 'Public website')}
          </button>
          <button
            type="button"
            className="danger-text"
            disabled={busy}
            onClick={onSignOut}
          >
            {t('Déconnexion', 'Sign out')}
          </button>
        </div>
      </aside>

      <div className="workspace-content">
        <div className="workspace-status">
          <span>{pharmacy?.name ?? t('Votre pharmacie', 'Your pharmacy')}</span>
          <span className={`status-pill ${
            pharmacy?.approved ? 'status-green' : 'status-amber'
          }`}>
            {pharmacy?.approved
              ? t('Approuvée', 'Approved')
              : t('En attente de validation', 'Pending approval')}
          </span>
        </div>

        {screen === 'dashboard' && (
          <>
            <div className="page-heading">
              <div>
                <h1>{t('Tableau de bord', 'Dashboard')}</h1>
                <p>{t('Vue d’ensemble de votre stock', 'An overview of your stock')}</p>
              </div>
              <button type="button" className="primary" onClick={openAdd}>
                <Icon name="plus" /> {t('Ajouter', 'Add')}
              </button>
            </div>

            <div className="dashboard-stats">
              {[
                {
                  label: t('Médicaments', 'Medicines'),
                  value: stock.length,
                  detail: t('Produits dans l’inventaire', 'Products in inventory'),
                  tone: 'blue',
                  icon: 'box' as IconName,
                  action: () => openInventory(),
                },
                {
                  label: t('Unités en stock', 'Units in stock'),
                  value: totalUnits,
                  detail: t('Quantité totale disponible', 'Total available quantity'),
                  tone: 'green',
                  icon: 'box' as IconName,
                  action: () => openInventory(),
                },
                {
                  label: t('Stock faible', 'Low stock'),
                  value: lowStock.length,
                  detail: t('Entre 1 et 5 unités', 'Between 1 and 5 units'),
                  tone: 'amber',
                  icon: 'alert' as IconName,
                  action: () => setActive('alerts'),
                },
                {
                  label: t('Ruptures', 'Out of stock'),
                  value: outOfStock.length,
                  detail: t('Quantité à zéro', 'Zero quantity'),
                  tone: 'red',
                  icon: 'alert' as IconName,
                  action: () => setActive('alerts'),
                },
              ].map(stat => (
                <button
                  key={stat.label}
                  type="button"
                  className="stat-card"
                  onClick={stat.action}
                >
                  <span className={`stat-icon tone-${stat.tone}`}>
                    <Icon name={stat.icon} />
                  </span>
                  <strong>{stat.value.toLocaleString(locale)}</strong>
                  <span>{stat.label}</span>
                  <small>{stat.detail}</small>
                </button>
              ))}
            </div>

            <div className="dashboard-actions">
              <button type="button" className="primary" onClick={openAdd}>
                <Icon name="plus" />
                {t('Ajouter au stock', 'Add stock')}
              </button>
              <button type="button" onClick={() => openInventory()}>
                {t('Gérer les médicaments', 'Manage medicines')}
              </button>
            </div>

            <div className="panel">
              <h2>{t('Dernières mises à jour', 'Latest stock updates')}</h2>
              {!recent.length && (
                <p className="empty">
                  {t(
                    'Ajoutez votre premier médicament pour commencer.',
                    'Add your first medicine to get started.'
                  )}
                </p>
              )}
              {recent.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="list-row"
                  onClick={() => openInventory(item.medicine)}
                >
                  <span>
                    <strong>{item.medicine}</strong>
                    <small>
                      {item.dosage} ·{' '}
                      {new Date(item.updated_at).toLocaleString(locale)}
                    </small>
                  </span>
                  <span className="quantity-total">{item.quantity}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {screen === 'inventory' && (
          <>
            <div className="page-heading">
              <div>
                <h1>{t('Inventaire', 'Inventory')}</h1>
                <p>{stock.length} {t('produit(s)', 'product(s)')}</p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setShowAdd(value => !value)}
              >
                {showAdd ? t('Fermer', 'Close') : t('+ Ajouter', '+ Add')}
              </button>
            </div>

            {showAdd && (
              <div className="panel">
                <h2>{t('Ajouter ou remplacer un stock', 'Add or replace stock')}</h2>
                <p className="muted">
                  {t(
                    'Le même nom et dosage remplacent l’entrée existante.',
                    'The same name and dosage replace the existing entry.'
                  )}
                </p>

                <form onSubmit={onAddStock} className="form-grid two">
                  <label>
                    {t('Médicament', 'Medicine')}
                    <input name="medicine" minLength={2} maxLength={150} required />
                  </label>
                  <label>
                    {t('Dosage et présentation', 'Dosage and pack')}
                    <input
                      name="dosage"
                      maxLength={100}
                      placeholder="500 mg · 16 comprimés"
                      required
                    />
                  </label>
                  <label>
                    {t('Quantité disponible', 'Available quantity')}
                    <input
                      name="quantity"
                      type="number"
                      min={0}
                      max={2147483647}
                      step={1}
                      required
                    />
                  </label>
                  <label>
                    {t('Prix par boîte, facultatif', 'Price per pack, optional')}
                    {' '}— {currency}
                    <input
                      name="price"
                      type="number"
                      min={0}
                      max={2147483647}
                      step={1}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    {t('Enregistrer le stock', 'Save stock')}
                  </button>
                </form>
              </div>
            )}

            <div className="inventory-search">
              <label htmlFor="inventory-search">
                {t('Rechercher dans mon stock', 'Search my inventory')}
              </label>
              <input
                id="inventory-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t(
                  'Nom du médicament ou dosage…',
                  'Medicine name or dosage…'
                )}
              />
              <div className="search-meta">
                <span role="status">
                  {filtered.length} / {stock.length}{' '}
                  {t('produits affichés', 'products shown')}
                </span>
                {query && (
                  <button type="button" onClick={() => setQuery('')}>
                    {t('Effacer', 'Clear')}
                  </button>
                )}
              </div>
            </div>

            {!filtered.length && (
              <p className="empty">
                {stock.length
                  ? t('Aucun médicament trouvé.', 'No matching medicines.')
                  : t('Votre inventaire est vide.', 'Your inventory is empty.')}
              </p>
            )}

            {filtered.map(item => (
              <article className="medicine-card" key={item.id}>
                <div className="medicine-heading">
                  <div>
                    <h2>{item.medicine}</h2>
                    <p className="muted">{item.dosage}</p>
                  </div>
                  <span className={`status-pill ${
                    item.quantity === 0
                      ? 'status-red'
                      : item.quantity <= 5
                        ? 'status-amber'
                        : 'status-green'
                  }`}>
                    {item.quantity === 0
                      ? t('Épuisé', 'Out of stock')
                      : item.quantity <= 5
                        ? t('Stock faible', 'Low stock')
                        : t('En stock', 'In stock')}
                  </span>
                </div>

                <StockQuantity
                  id={item.id}
                  medicine={item.medicine}
                  quantity={item.quantity}
                  en={en}
                  onChanged={(quantity, updatedAt) =>
                    onQuantityChanged(item.id, quantity, updatedAt)
                  }
                />

                <p className="price">
                  {item.price === null
                    ? t('Prix non renseigné', 'Price not provided')
                    : `${item.price.toLocaleString(locale)} ${currency}`}
                </p>
                <p className="muted">
                  {t('Mis à jour', 'Updated')}:{' '}
                  {new Date(item.updated_at).toLocaleString(locale)}
                </p>

                <div className="row">
                  <button
                    type="button"
                    disabled={busy || item.quantity === 0}
                    onClick={() => onMarkOut(item.id)}
                  >
                    {t('Marquer épuisé', 'Mark out of stock')}
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    disabled={busy}
                    onClick={() => onDelete(item.id)}
                  >
                    {t('Supprimer', 'Delete')}
                  </button>
                </div>
              </article>
            ))}
          </>
        )}

        {screen === 'alerts' && (
          <>
            <div className="page-heading">
              <div>
                <h1>{t('Alertes', 'Alerts')}</h1>
                <p>{t('Stock faible et ruptures', 'Low stock and stockouts')}</p>
              </div>
            </div>

            {[
              {
                title: t('Ruptures de stock', 'Out of stock'),
                tone: 'red',
                items: outOfStock,
                empty: t('Aucune rupture.', 'No stockouts.'),
              },
              {
                title: t('Stock faible : 1 à 5 unités', 'Low stock: 1–5 units'),
                tone: 'amber',
                items: lowStock,
                empty: t('Aucun stock faible.', 'No low-stock products.'),
              },
            ].map(group => (
              <div className="alert-panel" key={group.tone}>
                <h2 className={`alert-heading tone-${group.tone}`}>
                  <Icon name="alert" />
                  {group.title} ({group.items.length})
                </h2>
                <div className="alert-content">
                  {!group.items.length && (
                    <p className="empty">{group.empty}</p>
                  )}
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="list-row"
                      onClick={() => openInventory(item.medicine)}
                    >
                      <span>
                        <strong>{item.medicine}</strong>
                        <small>{item.dosage}</small>
                      </span>
                      <span className="quantity-total">{item.quantity}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {screen === 'profile' && (
          <>
            <div className="page-heading">
              <div>
                <h1>{t('Profil de la pharmacie', 'Pharmacy profile')}</h1>
                <p>
                  {t(
                    'Gérez vos informations publiques et votre localisation.',
                    'Manage your public information and location.'
                  )}
                </p>
              </div>
            </div>

            {!pharmacy && (
              <p className="notice">
                {t(
                  'Complétez ce profil pour commencer à gérer votre stock.',
                  'Complete this profile to start managing your stock.'
                )}
              </p>
            )}

            <div className="panel">
              <h2>{t('Informations générales', 'General information')}</h2>

              <form
                key={pharmacy?.id ?? 'new'}
                onSubmit={onSaveProfile}
                className="form-grid two"
              >
                <label className="full-width">
                  {t('Nom de la pharmacie', 'Pharmacy name')}
                  <input
                    name="name"
                    defaultValue={pharmacy?.name}
                    minLength={2}
                    maxLength={150}
                    required
                  />
                </label>
                <label>
                  {t('Téléphone international', 'International phone')}
                  <input
                    name="phone"
                    type="tel"
                    pattern="\+[0-9]{8,15}"
                    placeholder="+22890123456"
                    defaultValue={pharmacy?.phone}
                    required
                  />
                </label>
                <label>
                  {t('Numéro d’agrément', 'Professional licence number')}
                  <input
                    name="license_number"
                    defaultValue={pharmacy?.license_number}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  {t('Pays', 'Country')}
                  <select name="country" defaultValue={pharmacy?.country ?? 'TG'}>
                    {countries.map(([code, fr, english]) => (
                      <option key={code} value={code}>
                        {en ? english : fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Ville', 'City')}
                  <input
                    name="city"
                    defaultValue={pharmacy?.city}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label className="full-width">
                  {t('Adresse complète', 'Full address')}
                  <input
                    name="address"
                    defaultValue={pharmacy?.address}
                    minLength={3}
                    maxLength={300}
                    required
                  />
                </label>
                <p className="muted full-width">
                  {t(
                    'Les modifications nécessitent une nouvelle validation. Si vous changez de pays, vérifiez aussi la monnaie et les prix de votre inventaire.',
                    'Changes require approval again. If you change countries, also check your inventory currency and prices.'
                  )}
                </p>
                <button className="primary" disabled={busy}>
                  {t('Enregistrer le profil', 'Save profile')}
                </button>
              </form>
            </div>

            {pharmacy && (
              <PharmacyLocation
                pharmacyId={pharmacy.id}
                en={en}
                onSaved={onLocationSaved}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AdminWorkspace({
  pharmacies,
  en,
  busy,
  onReview,
}: {
  pharmacies: Pharmacy[];
  en: boolean;
  busy: boolean;
  onReview: (id: string, approved: boolean) => void;
}) {
  const [view, setView] = useState('pharmacies');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const t = (fr: string, english: string) => en ? english : fr;
  const approved = pharmacies.filter(item => item.approved).length;

  const filtered = pharmacies.filter(item => {
    const matchesStatus =
      filter === 'all' ||
      (filter === 'approved' && item.approved) ||
      (filter === 'unapproved' && !item.approved);

    const text = [
      item.name,
      item.city,
      item.address,
      item.phone,
      item.license_number,
      countryName(item.country, en),
    ].join(' ');

    return matchesStatus && normalise(text).includes(normalise(query));
  });

  const distribution = Object.entries(
    pharmacies.reduce<Record<string, number>>((counts, item) => {
      counts[item.country] = (counts[item.country] ?? 0) + 1;
      return counts;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <section className="admin-workspace">
      <div className="page-heading">
        <div>
          <h1>
            {view === 'pharmacies'
              ? t('Administration', 'Administration')
              : t('Statistiques', 'Statistics')}
          </h1>
          <p>{t('PharmaStock · Plateforme', 'PharmaStock · Platform')}</p>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={view === 'pharmacies' ? 'selected' : ''}
            aria-pressed={view === 'pharmacies'}
            onClick={() => setView('pharmacies')}
          >
            {t('Pharmacies', 'Pharmacies')}
          </button>
          <button
            type="button"
            className={view === 'statistics' ? 'selected' : ''}
            aria-pressed={view === 'statistics'}
            onClick={() => setView('statistics')}
          >
            {t('Statistiques', 'Statistics')}
          </button>
        </div>
      </div>

      <div className="admin-stats">
        {[
          [t('Pharmacies inscrites', 'Registered pharmacies'), pharmacies.length],
          [t('Approuvées', 'Approved'), approved],
          [t('Non approuvées', 'Not approved'), pharmacies.length - approved],
        ].map(([label, value]) => (
          <div className="admin-stat" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {view === 'pharmacies' && (
        <>
          <div className="admin-toolbar">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label={t('Rechercher une pharmacie', 'Search pharmacies')}
              placeholder={t(
                'Nom, ville, pays, téléphone, agrément…',
                'Name, city, country, phone, licence…'
              )}
            />
            <div className="segmented">
              {[
                ['all', t('Toutes', 'All')],
                ['unapproved', t('Non approuvées', 'Not approved')],
                ['approved', t('Approuvées', 'Approved')],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'selected' : ''}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="muted" role="status">
            {filtered.length} {t('résultat(s)', 'result(s)')}
          </p>

          {!filtered.length && (
            <p className="empty">
              {t('Aucune pharmacie trouvée.', 'No matching pharmacies.')}
            </p>
          )}

          {filtered.map(item => (
            <article className="admin-card" key={item.id}>
              <div className="medicine-heading">
                <h2>{item.name}</h2>
                <span className={`status-pill ${
                  item.approved ? 'status-green' : 'status-amber'
                }`}>
                  {item.approved
                    ? t('Approuvée', 'Approved')
                    : t('Non approuvée', 'Not approved')}
                </span>
              </div>
              <p>
                {item.address}, {item.city}, {countryName(item.country, en)}
              </p>
              <p><a href={`tel:${item.phone}`}>{item.phone}</a></p>
              <p>{t('Agrément', 'Licence')}: {item.license_number}</p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => onReview(item.id, !item.approved)}
              >
                {item.approved
                  ? t('Suspendre', 'Suspend')
                  : t('Approuver', 'Approve')}
              </button>
            </article>
          ))}

          <p className="disclaimer">
            {t(
              'Vérifiez l’agrément auprès de l’autorité compétente avant approbation. La liste des pharmacies non approuvées inclut les pharmacies suspendues.',
              'Verify the licence with the relevant authority before approval. Unapproved pharmacies include suspended pharmacies.'
            )}
          </p>
        </>
      )}

      {view === 'statistics' && (
        <div className="panel">
          <h2>{t('État global du réseau', 'Network overview')}</h2>
          <p className="muted">
            {t(
              'Répartition des pharmacies inscrites par pays',
              'Registered pharmacies by country'
            )}
          </p>
          {!distribution.length && (
            <p className="empty">
              {t('Aucune pharmacie inscrite.', 'No registered pharmacies.')}
            </p>
          )}
          {distribution.map(([code, count]) => (
            <div className="country-row" key={code}>
              <span>{countryName(code, en)}</span>
              <div className="country-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${count / Math.max(pharmacies.length, 1) * 100}%`,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [en, setEn] = useState(false);
  const t = (fr: string, english: string) => en ? english : fr;

  const [tab, setTab] = useState<PageTab>('search');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [reviews, setReviews] = useState<Pharmacy[]>([]);
  const [results, setResults] = useState<PharmacySearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [patientPosition, setPatientPosition] =
    useState<PatientPosition | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchQuery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const authUser = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const operationLock = useRef(false);

  useEffect(() => {
    document.documentElement.lang = en ? 'en' : 'fr';
  }, [en]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const nextId = next?.user.id ?? null;

      if (authUser.current !== nextId) {
        authUser.current = nextId;
        loadVersion.current += 1;
        setPharmacy(null);
        setStock([]);
        setReviews([]);
        setAdmin(false);
        setAccountLoading(Boolean(nextId));
      }

      setSession(next);
      setAuthReady(true);

      if (event === 'PASSWORD_RECOVERY') {
        setTab('account');
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function loadAccount(userId: string) {
  if (!supabase) return;

  const version = ++loadVersion.current;

  function isCurrentAccount() {
    return (
      version === loadVersion.current &&
      authUser.current === userId
    );
  }

  const profile = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile.error) throw profile.error;
  if (!isCurrentAccount()) return;

  const isAdmin = profile.data.role === 'admin';

  // Establish admin access before loading the other data.
  setAdmin(isAdmin);

  if (isAdmin) {
    setTab(current => current === 'pharmacy' ? 'admin' : current);
  }

  const response = await supabase
    .from('pharmacies')
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();

  if (response.error) throw response.error;
  if (!isCurrentAccount()) return;

  const ownPharmacy = response.data as Pharmacy | null;
  setPharmacy(ownPharmacy);

  const inventory = ownPharmacy
    ? await readInventory(ownPharmacy.id)
    : [];

  if (!isCurrentAccount()) return;
  setStock(inventory);

  if (isAdmin) {
    const allPharmacies = await readPharmacies();

    if (!isCurrentAccount()) return;
    setReviews(allPharmacies);
  } else {
    setReviews([]);
  }
}

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      setAccountLoading(false);
      return;
    }

    setAccountLoading(true);

    void loadAccount(userId)
      .catch(error => {
        if (authUser.current === userId) {
          setMessage(errorMessage(error));
        }
      })
      .finally(() => {
        if (authUser.current === userId) {
          setAccountLoading(false);
        }
      });
  }, [session?.user.id]);

  async function run(action: () => Promise<void>) {
    if (operationLock.current) return;

    operationLock.current = true;
    setBusy(true);
    setMessage('');

    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function values(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    const form = values(event);

    const query: SearchQuery = {
      term: String(form.get('term') ?? '').trim(),
      country_code: String(form.get('country') ?? ''),
      city_query: String(form.get('city') ?? '').trim(),
    };

    await run(async () => {
      if (!supabase) {
        throw new Error(
          t('Supabase n’est pas configuré.', 'Supabase is not configured.')
        );
      }

      const { data, error } = await supabase.rpc(
        'search_medicines_nearby',
        {
          ...query,
          patient_lat: patientPosition?.lat ?? null,
          patient_lng: patientPosition?.lng ?? null,
        }
      );

      if (error) throw error;
      setResults(data ?? []);
      setLastSearch(query);
      setSearched(true);
    });
  }

  async function findNearest() {
    if (!lastSearch || busy) return;
    const query = lastSearch;

    await run(async () => {
      if (!supabase) {
        throw new Error(
          t('Supabase n’est pas configuré.', 'Supabase is not configured.')
        );
      }

      if (!navigator.geolocation) {
        throw new Error(
          t(
            'Votre navigateur ne permet pas la géolocalisation.',
            'Your browser does not support geolocation.'
          )
        );
      }

      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error(
              t(
                'Localisation indisponible. Autorisez la localisation ou continuez la recherche par ville.',
                'Location unavailable. Allow location access or continue searching by city.'
              )
            )),
            {
              enableHighAccuracy: true,
              timeout: 20000,
              maximumAge: 0,
            }
          );
        }
      );

      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const { data, error } = await supabase.rpc(
        'search_medicines_nearby',
        {
          ...query,
          patient_lat: location.lat,
          patient_lng: location.lng,
        }
      );

      if (error) throw error;
      setResults(data ?? []);
      setPatientPosition(location);
    });
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    const form = values(event);

    await run(async () => {
      if (authMode === 'signup' && form.get('acceptTerms') !== 'yes') {
        throw new Error(
          t(
            'Veuillez accepter les conditions d’utilisation.',
            'Please accept the terms of use.'
          )
        );
      }

      if (!supabase) {
        throw new Error(
          t('Supabase n’est pas configuré.', 'Supabase is not configured.')
        );
      }

      const credentials = {
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      };

      const response = authMode === 'signup'
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: window.location.origin },
          })
        : await supabase.auth.signInWithPassword(credentials);

      if (response.error) throw response.error;

      if (authMode === 'signup') {
        setMessage(
          t(
            'Compte créé. Consultez votre e-mail pour confirmer votre inscription.',
            'Account created. Check your email to confirm registration.'
          )
        );
      }
    });
  }

  async function signOut() {
    await run(async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setTab('search');
    });
  }

  async function savePharmacy(event: FormEvent<HTMLFormElement>) {
    const form = values(event);

    await run(async () => {
      if (!supabase || !session) return;

      const fields = {
        name: String(form.get('name')).trim(),
        country: String(form.get('country')),
        city: String(form.get('city')).trim(),
        address: String(form.get('address')).trim(),
        phone: String(form.get('phone')).trim(),
        license_number: String(form.get('license_number')).trim(),
      };

      const response = pharmacy
        ? await supabase
            .from('pharmacies')
            .update(fields)
            .eq('id', pharmacy.id)
        : await supabase
            .from('pharmacies')
            .insert({ ...fields, owner_id: session.user.id });

      if (response.error) throw response.error;
      await loadAccount(session.user.id);

      setMessage(
        t(
          'Profil enregistré. Les modifications nécessitent une validation.',
          'Profile saved. Changes require approval.'
        )
      );
    });
  }

  async function addStock(event: FormEvent<HTMLFormElement>) {
    const element = event.currentTarget;
    const form = values(event);

    await run(async () => {
      if (!supabase || !pharmacy || !session) return;

      const { error } = await supabase.from('inventory').upsert(
        {
          pharmacy_id: pharmacy.id,
          medicine: String(form.get('medicine')).trim(),
          dosage: String(form.get('dosage')).trim(),
          quantity: Number(form.get('quantity')),
          price: form.get('price') === ''
            ? null
            : Number(form.get('price')),
        },
        { onConflict: 'pharmacy_id,medicine,dosage' }
      );

      if (error) throw error;
      element.reset();
      await loadAccount(session.user.id);
      setMessage(t('Stock enregistré.', 'Stock saved.'));
    });
  }

  function changeTab(next: PageTab) {
    setTab(next);
    setMessage('');
  }

  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          aria-label="PharmaStock"
          onClick={event => {
            event.preventDefault();
            changeTab('search');
          }}
        >
          <img src="/logo.png" alt="PharmaStock" />
        </a>

        <nav className="site-navigation" aria-label={t('Navigation', 'Navigation')}>
          <button
            type="button"
            className={tab === 'search' ? 'nav-current' : ''}
            onClick={() => changeTab('search')}
          >
            {t('Accueil', 'Home')}
          </button>

          {admin && (
            <button
              type="button"
              className={tab === 'admin' ? 'nav-current' : ''}
              onClick={() => changeTab('admin')}
            >
              {t('Administration', 'Administration')}
            </button>
          )}

          <button
            type="button"
            className="header-cta"
            onClick={() => changeTab('pharmacy')}
          >
            {session
              ? t('Espace pharmacie', 'Pharmacy workspace')
              : t('Inscrire ma pharmacie', 'Register my pharmacy')}
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            onClick={() => setEn(value => !value)}
            aria-label={t('Passer en anglais', 'Switch to French')}
          >
            {en ? 'FR' : 'EN'}
          </button>

          {session && (
            <>
              <button type="button" onClick={() => changeTab('account')}>
                {t('Mon compte', 'My account')}
              </button>
              <button type="button" disabled={busy} onClick={() => void signOut()}>
                {t('Déconnexion', 'Sign out')}
              </button>
            </>
          )}
        </div>
      </header>

      <main className="site-main">
        {!supabase && (
          <p className="notice">
            {t(
              'Configuration Supabase requise. Aucun stock fictif n’est affiché.',
              'Supabase configuration is required. No fictional stock is shown.'
            )}
          </p>
        )}

        {message && <p className="notice" role="status">{message}</p>}

        {tab === 'search' && (
          <>
            <section className="hero">
              <span className="region-pill">
                <Icon name="globe" />
                {t('À travers l’Afrique', 'Across Africa')}
              </span>

              <h1>
                {t('Trouvez vos médicaments', 'Find your medicines')}
                <br />
                <span>
                  {t(
                    'dans les pharmacies d’Afrique',
                    'in pharmacies across Africa'
                  )}
                </span>
              </h1>

              <p>
                {t(
                  'Vérifiez les disponibilités déclarées avant de vous déplacer. Recherchez un médicament, contactez la pharmacie et obtenez un itinéraire.',
                  'Check reported availability before travelling. Search for a medicine, contact the pharmacy and get directions.'
                )}
              </p>

              <form className="search-form" onSubmit={search}>
                <label className="full-width">
                  {t('Rechercher un médicament', 'Search for a medicine')}
                  <input
                    name="term"
                    required
                    minLength={2}
                    maxLength={150}
                    placeholder={t(
                      'Nom du médicament, ex. paracétamol',
                      'Medicine name, e.g. paracetamol'
                    )}
                  />
                </label>
                <label>
                  {t('Pays', 'Country')}
                  <select name="country" defaultValue="TG">
                    {countries.map(([code, fr, english]) => (
                      <option key={code} value={code}>
                        {en ? english : fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Ville, facultatif', 'City, optional')}
                  <input name="city" maxLength={100} placeholder="Lomé" />
                </label>
                <button className="primary full-width" disabled={busy}>
                  {busy
                    ? t('Veuillez patienter…', 'Please wait…')
                    : t('Trouver un médicament →', 'Find a medicine →')}
                </button>
              </form>

              <p className="hero-note">
                {t(
                  'Sans compte patient · Pharmacies approuvées · Prix en monnaie locale',
                  'No patient account · Approved pharmacies · Local currency prices'
                )}
              </p>
            </section>

            <section className="results-section">
              <div className="section-heading">
                <h2>
                  {searched
                    ? t('Résultats disponibles', 'Available results')
                    : t('Votre recherche, en trois étapes', 'Search in three steps')}
                </h2>
                {searched && (
                  <span className="muted">
                    {results.length}{' '}
                    {t('résultat(s), maximum 100', 'result(s), maximum 100')}
                  </span>
                )}
              </div>

              {searched ? (
                <SearchResults
                  results={results}
                  en={en}
                  patientPosition={patientPosition}
                  busy={busy}
                  onLocate={() => void findNearest()}
                />
              ) : (
                <div className="cards">
                  {[
                    [
                      t('Recherchez', 'Search'),
                      t(
                        'Indiquez le médicament et choisissez votre pays.',
                        'Enter the medicine and select your country.'
                      ),
                    ],
                    [
                      t('Comparez', 'Compare'),
                      t(
                        'Consultez les disponibilités, prix et distances estimées.',
                        'View availability, prices and estimated distances.'
                      ),
                    ],
                    [
                      t('Appelez et trouvez votre chemin', 'Call and get directions'),
                      t(
                        'Confirmez le stock avant de vous déplacer.',
                        'Confirm stock before travelling.'
                      ),
                    ],
                  ].map(([title, text], index) => (
                    <article className="card" key={title}>
                      <span className="step">0{index + 1}</span>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </article>
                  ))}
                </div>
              )}

              <p className="disclaimer">
                {t(
                  'Les disponibilités sont déclarées par les pharmacies et peuvent changer. Appelez avant de vous déplacer. Aucun diagnostic, conseil médical personnalisé ou vente en ligne. Respectez les prescriptions.',
                  'Availability is reported by pharmacies and may change. Call before travelling. No diagnosis, personalised medical advice or online sales. Follow prescription requirements.'
                )}
              </p>
            </section>
          </>
        )}

        {tab === 'pharmacy' && (!authReady || accountLoading) && (
          <p className="empty" role="status">
            {t('Chargement de votre espace…', 'Loading your workspace…')}
          </p>
        )}

        {tab === 'pharmacy' && authReady && !session && (
          <section className="panel auth-panel">
            <span className="eyebrow">
              {t('POUR LES PROFESSIONNELS', 'FOR PROFESSIONALS')}
            </span>
            <h1>{t('Votre pharmacie, visible.', 'Make your pharmacy visible.')}</h1>
            <p className="muted">
              {t(
                'Gérez votre stock et aidez les patients à vous trouver.',
                'Manage stock and help patients find you.'
              )}
            </p>

            <div className="segmented">
              <button
                type="button"
                className={authMode === 'login' ? 'selected' : ''}
                onClick={() => setAuthMode('login')}
              >
                {t('Connexion', 'Sign in')}
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'selected' : ''}
                onClick={() => setAuthMode('signup')}
              >
                {t('Créer un compte', 'Create account')}
              </button>
            </div>

            <form onSubmit={authenticate} className="form-grid">
              <label>
                E-mail
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                {t('Mot de passe', 'Password')}
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete={
                    authMode === 'signup' ? 'new-password' : 'current-password'
                  }
                  required
                />
              </label>

              {authMode === 'signup' && (
                <div className="terms">
                  <details>
                    <summary>
                      {t(
                        'Lire les conditions d’utilisation',
                        'Read the terms of use'
                      )}
                    </summary>
                    <p>
                      {t(
                        'PharmaStock permet aux pharmacies de publier leurs disponibilités et aux patients de rechercher des médicaments.',
                        'PharmaStock allows pharmacies to publish availability and patients to search for medicines.'
                      )}
                    </p>
                    <ul>
                      {terms.map(([fr, english]) => (
                        <li key={fr}>{t(fr, english)}</li>
                      ))}
                    </ul>
                  </details>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="acceptTerms"
                      value="yes"
                      required
                    />
                    <span>
                      {t(
                        'J’ai lu et j’accepte les conditions d’utilisation.',
                        'I have read and accept the terms of use.'
                      )}
                    </span>
                  </label>
                </div>
              )}

              <button className="primary" disabled={busy}>
                {busy
                  ? '…'
                  : authMode === 'signup'
                    ? t('Créer mon compte', 'Create my account')
                    : t('Se connecter', 'Sign in')}
              </button>
            </form>

            <button
              type="button"
              className="text-button"
              onClick={() => changeTab('reset')}
            >
              {t('Mot de passe oublié ?', 'Forgot password?')}
            </button>
          </section>
        )}

        {tab === 'pharmacy' && session && !accountLoading && (
          <PharmacyWorkspace
            pharmacy={pharmacy}
            stock={stock}
            en={en}
            busy={busy}
            onSaveProfile={savePharmacy}
            onAddStock={addStock}
            onQuantityChanged={(id, quantity, updatedAt) =>
              setStock(current =>
                current.map(item =>
                  item.id === id
                    ? { ...item, quantity, updated_at: updatedAt }
                    : item
                )
              )
            }
            onMarkOut={id => {
              void run(async () => {
                if (!supabase) return;
                const { error } = await supabase
                  .from('inventory')
                  .update({ quantity: 0 })
                  .eq('id', id);

                if (error) throw error;
                await loadAccount(session.user.id);
              });
            }}
            onDelete={id => {
              if (!window.confirm(
                t('Supprimer ce stock ?', 'Delete this stock?')
              )) return;

              void run(async () => {
                if (!supabase) return;
                const { error } = await supabase
                  .from('inventory')
                  .delete()
                  .eq('id', id);

                if (error) throw error;
                await loadAccount(session.user.id);
              });
            }}
            onLocationSaved={() => {
              void run(async () => {
                await loadAccount(session.user.id);
              });
            }}
            onPublic={() => changeTab('search')}
            onAccount={() => changeTab('account')}
            onSignOut={() => void signOut()}
          />
        )}

        {tab === 'admin' && admin && session && (
          <AdminWorkspace
            pharmacies={reviews}
            en={en}
            busy={busy}
            onReview={(id, approved) => {
              void run(async () => {
                if (!supabase) return;
                const { error } = await supabase.rpc('review_pharmacy', {
                  target: id,
                  decision: approved,
                });

                if (error) throw error;
                await loadAccount(session.user.id);
              });
            }}
          />
        )}

        {tab === 'reset' && (
          <section className="panel auth-panel">
            <h1>{t('Réinitialiser le mot de passe', 'Reset password')}</h1>
            <form
              className="form-grid"
              onSubmit={event => {
                const form = values(event);

                void run(async () => {
                  if (!supabase) {
                    throw new Error('Supabase configuration required');
                  }

                  const { error } = await supabase.auth.resetPasswordForEmail(
                    String(form.get('email')).trim(),
                    { redirectTo: window.location.origin + '/?recovery=1' }
                  );

                  if (error) throw error;
                  setMessage(
                    t(
                      'Consultez votre e-mail pour continuer.',
                      'Check your email to continue.'
                    )
                  );
                });
              }}
            >
              <label>
                E-mail
                <input name="email" type="email" required />
              </label>
              <button className="primary" disabled={busy}>
                {t('Envoyer le lien', 'Send link')}
              </button>
            </form>
          </section>
        )}

        {tab === 'account' && session && (
          <section className="panel auth-panel">
            <h1>{t('Mon compte', 'My account')}</h1>
            <p className="muted">{session.user.email}</p>
            <form
              className="form-grid"
              onSubmit={event => {
                const form = values(event);

                void run(async () => {
                  if (!supabase) return;
                  const { error } = await supabase.auth.updateUser({
                    password: String(form.get('password')),
                  });

                  if (error) throw error;
                  setMessage(t('Mot de passe modifié.', 'Password updated.'));
                });
              }}
            >
              <label>
                {t('Nouveau mot de passe', 'New password')}
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                {t('Enregistrer', 'Save')}
              </button>
            </form>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <strong>PharmaStock</strong>
        <p>
          {t(
            'Connecter les patients et les pharmacies en Afrique.',
            'Connecting patients and pharmacies across Africa.'
          )}
        </p>
        <small>
          {t(
            'Prix dans la monnaie locale de la pharmacie. Sans réservation ni paiement en ligne.',
            'Prices in the pharmacy’s local currency. No online reservations or payments.'
          )}
        </small>
      </footer>
    </>
  );
}
