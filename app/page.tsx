'use client';
import StockQuantity from './stock-quantity';
import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import PharmacyLocation from './pharmacy-location';
import SearchResults, {
  type PatientPosition,
  type PharmacySearchResult,
} from './search-results';

type Pharmacy = {id:string;name:string;country:string;city:string;address:string;phone:string;license_number:string;approved:boolean};
type Stock = {id:string;medicine:string;dosage:string;quantity:number;price:number|null;updated_at:string};
type Result = PharmacySearchResult;
const countries = [['TG','Togo','Togo'],['BJ','Bénin','Benin'],['BF','Burkina Faso','Burkina Faso'],['CI','Côte d’Ivoire','Ivory Coast']];
export default function Home() {
 const [en,setEn]=useState(false); const [patientPosition, setPatientPosition] =
  useState<PatientPosition | null>(null);

const [lastSearch, setLastSearch] = useState<{
  term: string;
  country_code: string;
  city_query: string;
} | null>(null); const t=(fr:string,english:string)=>en?english:fr;
 const [tab,setTab]=useState('search'); const [session,setSession]=useState<Session|null>(null);
 const [admin,setAdmin]=useState(false); const [pharmacy,setPharmacy]=useState<Pharmacy|null>(null);
 const [stock,setStock]=useState<Stock[]>([]); 
 const [inventorySearch, setInventorySearch] = useState('');

const inventoryQuery = inventorySearch
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const visibleStock = stock.filter(item => {
  const name = `${item.medicine} ${item.dosage}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return name.includes(inventoryQuery);
});
 const [reviews,setReviews]=useState<Pharmacy[]>([]);
 const [results,setResults]=useState<Result[]>([]); const [searched,setSearched]=useState(false);
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 const [authMode,setAuthMode]=useState('login');
 useEffect(()=>{document.documentElement.lang=en?'en':'fr';},[en]);
 useEffect(()=>{
  if(!supabase)return;
  void supabase.auth.getSession().then(({data})=>setSession(data.session));
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setPharmacy(null);setStock([]);setReviews([]);setAdmin(false);});
  return ()=>data.subscription.unsubscribe();
 },[]);
 async function loadAccount(userId:string) {
  if(!supabase)return;
  const profile=await supabase.from('profiles').select('role').eq('id',userId).single();
  if(profile.error)throw profile.error;
  const isAdmin=profile.data.role==='admin';setAdmin(isAdmin);
  const p=await supabase.from('pharmacies').select('*').eq('owner_id',userId).maybeSingle();
  if(p.error)throw p.error;setPharmacy(p.data);
  if(p.data){const s=await supabase.from('inventory').select('*').eq('pharmacy_id',p.data.id).order('medicine');if(s.error)throw s.error;setStock(s.data);}
  if(isAdmin){const r=await supabase.from('pharmacies').select('*').order('created_at');if(r.error)throw r.error;setReviews(r.data);}
 }
 useEffect(()=>{if(session)void loadAccount(session.user.id).catch(e=>setMessage(e.message));},[session]);
 async function run(action:()=>Promise<void>){setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e));}finally{setBusy(false);}}
 function values(e:FormEvent<HTMLFormElement>){e.preventDefault();return new FormData(e.currentTarget);}
 const countryOptions=countries.map(([code,fr,english])=><option key={code} value={code}>{en?english:fr}</option>);
 async function search(e: FormEvent<HTMLFormElement>) {
  const f = values(e);

  const query = {
    term: String(f.get('term') ?? '').trim(),
    country_code: String(f.get('country') ?? ''),
    city_query: String(f.get('city') ?? '').trim(),
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
              'Localisation indisponible. Autorisez la localisation dans votre navigateur ou continuez la recherche par ville.',
              'Location unavailable. Allow location access in your browser or continue searching by city.'
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
 async function authenticate(e:FormEvent<HTMLFormElement>){const f=values(e);await run(async()=>{
  if(!supabase)throw Error(t('Supabase n’est pas encore configuré.','Supabase is not configured yet.'));
  const credentials={email:String(f.get('email')),password:String(f.get('password'))};
  const {error}=authMode==='signup'?await supabase.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin}}):await supabase.auth.signInWithPassword(credentials);
  if(error)throw error;if(authMode==='signup')setMessage(t('Compte créé. Consultez votre e-mail pour confirmer votre inscription.','Account created. Check your email to confirm your registration.'));
 });}
 async function savePharmacy(e:FormEvent<HTMLFormElement>){const f=values(e);await run(async()=>{
  if(!supabase||!session)return;
  const fields={name:String(f.get('name')).trim(),country:String(f.get('country')),city:String(f.get('city')).trim(),address:String(f.get('address')).trim(),phone:String(f.get('phone')).trim(),license_number:String(f.get('license_number')).trim()};
  const response=pharmacy?await supabase.from('pharmacies').update(fields).eq('id',pharmacy.id):await supabase.from('pharmacies').insert({...fields,owner_id:session.user.id});
  if(response.error)throw response.error;await loadAccount(session.user.id);setMessage(t('Profil enregistré. Toute modification nécessite une validation.','Profile saved. Changes require approval.'));
 });}
 async function addStock(e:FormEvent<HTMLFormElement>){const form=e.currentTarget;const f=values(e);await run(async()=>{
  if(!supabase||!pharmacy||!session)return;
  const {error}=await supabase.from('inventory').upsert({pharmacy_id:pharmacy.id,medicine:String(f.get('medicine')).trim(),dosage:String(f.get('dosage')).trim(),quantity:Number(f.get('quantity')),price:f.get('price')===''?null:Number(f.get('price'))},{onConflict:'pharmacy_id,medicine,dosage'});
  if(error)throw error;form.reset();await loadAccount(session.user.id);setMessage(t('Stock enregistré.','Stock saved.'));
 });}
 return <><header><a className="brand" href="/" aria-label="PharmaStock">
  <img src="/logo.png" alt="PharmaStock" style={{ width: 220, height: "auto" }} />
</a><div className="header-actions"><button className="language" onClick={()=>setEn(!en)}>{en?'FR':'EN'}</button>{session&&<button className="language" onClick={()=>void run(async()=>{const {error}=await supabase!.auth.signOut();if(error)throw error;setTab('search');})}>{t('Déconnexion','Sign out')}</button>}</div></header>
 <main><nav aria-label={t('Navigation principale','Main navigation')}><button className={tab==='search'?'active':''} onClick={()=>{setTab('search');setMessage('');}}>{t('Trouver un médicament','Find medicine')}</button><button className={tab==='pharmacy'?'active':''} onClick={()=>{setTab('pharmacy');setMessage('');}}>{t('Espace pharmacie','Pharmacy workspace')}</button>{admin&&<button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>{t('Administration','Administration')}</button>}</nav>
 {!supabase&&<p className="notice">{t('Configuration requise : ajoutez les variables Supabase indiquées dans le guide. Aucun stock fictif n’est affiché.','Setup required: add the Supabase variables from the guide. No fictional stock is displayed.')}</p>}
 {message&&<p className="notice" role="status">{message}</p>}
 {tab==='search'&&<><section className="hero"><div className="eyebrow">{t('VOTRE SANTÉ, PLUS PROCHE','YOUR HEALTH, CLOSER')}</div><h1>{t('Votre médicament.','Your medicine.')}<br/><span>{t('La bonne pharmacie.','The right pharmacy.')}</span></h1><p>{t('Vérifiez la disponibilité avant de vous déplacer. Trouvez une pharmacie au Togo, au Bénin, au Burkina Faso et en Côte d’Ivoire.','Check availability before you travel. Find a pharmacy in Togo, Benin, Burkina Faso and Ivory Coast.')}</p>
 <form className="search-form" onSubmit={search}><label>{t('Médicament','Medicine')}<input name="term" required minLength={2} maxLength={150} placeholder={t('Ex. paracétamol','E.g. paracetamol')}/></label><label>{t('Pays','Country')}<select name="country">{countryOptions}</select></label><label>{t('Ville (facultatif)','City (optional)')}<input name="city" maxLength={100} placeholder={t('Ex. Lomé','E.g. Lomé')}/></label><button disabled={busy} className="primary">{busy?t('Recherche…','Searching…'):t('Rechercher','Search')}</button></form>
 <div className="country-strip">{countries.map(([code,fr,english])=><span key={code}><i/> {en?english:fr}</span>)}</div></section>
 <section><div className="section-heading"><h2>{searched?t('Résultats disponibles','Available results'):t('Moins de trajets. Plus de sérénité.','Less travel. More peace of mind.')}</h2>{searched&&<span>{results.length} {t('résultat(s), maximum 100','result(s), maximum 100')}</span>}</div>
 {searched ? (
  <SearchResults
    results={results}
    en={en}
    patientPosition={patientPosition}
    busy={busy}
    onLocate={() => void findNearest()}
  />
) : (
  <p>
    {t(
      'Recherchez un médicament pour voir les pharmacies.',
      'Search for a medicine to see pharmacies.'
    )}
  </p>
)} <p className="disclaimer">{t('La disponibilité est déclarée par les pharmacies et peut changer. Aucun conseil médical, diagnostic ou vente en ligne. Respectez les prescriptions et demandez conseil à un professionnel de santé.','Availability is reported by pharmacies and may change. No medical advice, diagnosis or online sales. Follow prescriptions and consult a healthcare professional.')}</p></section></>}
 {tab==='pharmacy'&&!session&&<section className="panel narrow"><div className="eyebrow">{t('POUR LES PROFESSIONNELS','FOR PROFESSIONALS')}</div><h1 className="small-title">{t('Votre pharmacie, visible.','Make your pharmacy visible.')}</h1><p>{t('Gérez votre stock et aidez les patients à vous trouver.','Manage your stock and help patients find you.')}</p><div className="switch"><button onClick={()=>setAuthMode('login')} className={authMode==='login'?'active':''}>{t('Connexion','Sign in')}</button><button onClick={()=>setAuthMode('signup')} className={authMode==='signup'?'active':''}>{t('Créer un compte','Create account')}</button></div><form onSubmit={authenticate} className="form-grid"><label>E-mail<input name="email" type="email" autoComplete="email" required/></label><label>{t('Mot de passe','Password')}<input name="password" type="password" minLength={8} autoComplete={authMode==='signup'?'new-password':'current-password'} required/></label><button disabled={busy} className="primary">{busy?'…':authMode==='signup'?t('Créer mon compte','Create my account'):t('Se connecter','Sign in')}</button></form><button className="text-button" disabled={busy} onClick={()=>setTab('reset')}>{t('Mot de passe oublié ?','Forgot password?')}</button></section>}
 {tab==='reset'&&<section className="panel narrow"><h2>{t('Réinitialiser le mot de passe','Reset password')}</h2><form className="form-grid" onSubmit={e=>{const f=values(e);void run(async()=>{if(!supabase)throw Error('Supabase configuration required');const {error}=await supabase.auth.resetPasswordForEmail(String(f.get('email')),{redirectTo:window.location.origin+'/?recovery=1'});if(error)throw error;setMessage(t('Consultez votre e-mail pour continuer.','Check your email to continue.'));});}}><label>E-mail<input name="email" type="email" required/></label><button className="primary" disabled={busy}>{t('Envoyer le lien','Send link')}</button></form></section>}
 {session&&<details className="account"><summary>{t('Mon compte : modifier le mot de passe','My account: change password')}</summary><form className="form-grid" onSubmit={e=>{const f=values(e);void run(async()=>{const {error}=await supabase!.auth.updateUser({password:String(f.get('password'))});if(error)throw error;setMessage(t('Mot de passe modifié.','Password updated.'));});}}><label>{t('Nouveau mot de passe','New password')}<input type="password" name="password" minLength={8} autoComplete="new-password" required/></label><button className="primary" disabled={busy}>{t('Enregistrer','Save')}</button></form></details>}
 {tab==='pharmacy'&&session&&<section><div className="section-heading"><h1 className="small-title">{t('Mon espace pharmacie','My pharmacy workspace')}</h1><span className="badge">{pharmacy?.approved?t('Approuvée','Approved'):t('En attente de validation','Pending approval')}</span></div><details open={!pharmacy} className="panel"><summary>{t('Profil de la pharmacie','Pharmacy profile')}</summary><form key={pharmacy?.id||'new'} onSubmit={savePharmacy} className="form-grid two"><label>{t('Nom de la pharmacie','Pharmacy name')}<input name="name" defaultValue={pharmacy?.name} minLength={2} maxLength={150} required/></label><label>{t('Pays','Country')}<select name="country" defaultValue={pharmacy?.country||'TG'}>{countryOptions}</select></label><label>{t('Ville','City')}<input name="city" defaultValue={pharmacy?.city} minLength={2} maxLength={100} required/></label><label>{t('Adresse complète','Full address')}<input name="address" defaultValue={pharmacy?.address} minLength={3} maxLength={300} required/></label><label>{t('Téléphone international','International phone')}<input name="phone" type="tel" placeholder="+22890123456" pattern="\+[0-9]{8,15}" defaultValue={pharmacy?.phone} required/></label><label>{t('Numéro d’agrément professionnel','Professional licence number')}<input name="license_number" defaultValue={pharmacy?.license_number} minLength={2} maxLength={100} required/></label><button disabled={busy} className="primary">{t('Enregistrer le profil','Save profile')}</button></form></details>
 {pharmacy && (
  <PharmacyLocation
    pharmacyId={pharmacy.id}
    en={en}
    onSaved={() =>
      setPharmacy(current =>
        current ? { ...current, approved: false } : current
      )
    }
  />
)}{pharmacy&&<><div className="panel"><h2>{t('Ajouter ou remplacer un stock','Add or replace stock')}</h2><p>{t('Le même nom et dosage remplacent le stock existant. Les quantités à zéro sont masquées dans la recherche.','The same name and dosage replace existing stock. Zero quantities are hidden from search.')}</p><form onSubmit={addStock} className="form-grid two"><label>{t('Médicament','Medicine')}<input name="medicine" minLength={2} maxLength={150} required/></label><label>{t('Dosage et présentation','Dosage and pack')}<input name="dosage" placeholder="500 mg · 16 comprimés" maxLength={100} required/></label><label>{t('Quantité disponible','Available quantity')}<input name="quantity" type="number" min={0} max={2147483647} step={1} required/></label><label>{t('Prix par boîte en FCFA (facultatif)','Price per pack in FCFA (optional)')}<input name="price" type="number" min={0} max={2147483647} step={1}/></label><button disabled={busy} className="primary">{t('Enregistrer le stock','Save stock')}</button></form></div><h2>{t('Mon inventaire','My inventory')}</h2><div className="panel">
  <label htmlFor="inventory-search">
    {t('Rechercher dans mon stock', 'Search my inventory')}
  </label>

  <input
    id="inventory-search"
    type="search"
    value={inventorySearch}
    onChange={event => setInventorySearch(event.target.value)}
    placeholder={t(
      'Nom du médicament ou dosage…',
      'Medicine name or dosage…'
    )}
    style={{ marginTop: 10 }}
  />

  <p role="status">
    {visibleStock.length} / {stock.length}{' '}
    {t('produits affichés', 'products shown')}
  </p>

  {inventorySearch && (
    <button type="button" onClick={() => setInventorySearch('')}>
      {t('Effacer la recherche', 'Clear search')}
    </button>
  )}

  {stock.length > 0 && visibleStock.length === 0 && (
    <p>
      {t(
        'Aucun médicament ne correspond à votre recherche.',
        'No medicine matches your search.'
      )}
    </p>
  )}
</div>{!stock.length&&<p className="empty">{t('Votre inventaire est vide. Ajoutez votre premier médicament.','Your inventory is empty. Add your first medicine.')}</p>}<div className="cards">{visibleStock.map(s=><article className="card" key={s.id}><h3>{s.medicine}</h3><p>{s.dosage}</p><StockQuantity
  id={s.id}
  medicine={s.medicine}
  quantity={s.quantity}
  en={en}
  onChanged={(quantity, updatedAt) =>
    setStock(current =>
      current.map(item =>
        item.id === s.id
          ? { ...item, quantity, updated_at: updatedAt }
          : item
      )
    )
  }
/>
<p>
  {t('Prix', 'Price')}: {s.price === null ? '—' : `${s.price} FCFA`}
</p><p className="muted">{new Date(s.updated_at).toLocaleString(en?'en-GB':'fr-FR')}</p><div className="row"><button disabled={busy} onClick={()=>void run(async()=>{const {error}=await supabase!.from('inventory').update({quantity:0}).eq('id',s.id);if(error)throw error;await loadAccount(session.user.id);})}>{t('Marquer épuisé','Mark out of stock')}</button><button disabled={busy} onClick={()=>{if(window.confirm(t('Supprimer ce stock ?','Delete this stock?')))void run(async()=>{const {error}=await supabase!.from('inventory').delete().eq('id',s.id);if(error)throw error;await loadAccount(session.user.id);});}}>{t('Supprimer','Delete')}</button></div></article>)}</div></>}
 </section>}
 {tab==='admin'&&admin&&session&&<section><h1 className="small-title">{t('Validation des pharmacies','Pharmacy approval')}</h1><p>{t('Vérifiez l’agrément auprès de l’autorité compétente et contactez la pharmacie avant de l’approuver.','Verify the licence with the relevant authority and contact the pharmacy before approval.')}</p>{!reviews.length&&<p className="empty">{t('Aucune pharmacie inscrite.','No registered pharmacies.')}</p>}<div className="cards">{reviews.map(p=><article className="card" key={p.id}><span className="badge">{p.approved?t('Approuvée','Approved'):t('À vérifier','Needs review')}</span><h3>{p.name}</h3><p>{p.address}, {p.city} ({p.country})</p><p>{p.phone}</p><p>{t('Agrément','Licence')}: {p.license_number}</p><button disabled={busy} className="primary" onClick={()=>void run(async()=>{const {error}=await supabase!.rpc('review_pharmacy',{target:p.id,decision:!p.approved});if(error)throw error;await loadAccount(session.user.id);})}>{p.approved?t('Suspendre','Suspend'):t('Approuver','Approve')}</button></article>)}</div></section>}
 </main><footer><a className="brand" href="/" aria-label="PharmaStock">
  <img src="/logo.png" alt="PharmaStock" style={{ width: 220, height: "auto" }} />
</a><p>{t('Connecter les patients et les pharmacies en Afrique de l’Ouest.','Connecting patients and pharmacies across West Africa.')}</p><small>{t('Prix en FCFA (XOF). Service de recherche, sans réservation ni paiement.','Prices in FCFA (XOF). Search service, without reservations or payments.')}</small></footer></>;
}
