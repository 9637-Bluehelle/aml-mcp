/**
 * Ruoli che amministrano lo studio: RT1 (autovalutazione dello studio),
 * Impostazioni e Pannello di Amministrazione sono riservati a loro.
 *
 * Sta in un helper unico perché i ruoli in `user_profiles.role` sono quattro
 * (`superadmin`, `admin`, `user`, `collaboratore`) e i confronti scritti a mano
 * erano già divergenti: la barra di navigazione escludeva RT1 al solo `user`
 * mentre App svuotava la pagina al solo `collaboratore`. Risultato: un
 * collaboratore vedeva la voce di menu e ci trovava una pagina bianca, e un
 * `user` che ci arrivava da un alert vedeva invece la sezione intera.
 */
export const amministraStudio = (ruolo: string | null | undefined): boolean =>
  ruolo === 'admin' || ruolo === 'superadmin';
