// Seitenraster der Ticket-Seiten am PC (ab xl): links der Inhalt (Titel, Beschreibung, Verlauf, Kosten,
// Anhänge), rechts die Eigenschaften (Status, Termin, Bezug) als Seitenleiste. Darunter alles untereinander.
// Das Formular (`TicketForm`) liegt als `display: contents` mitten im Raster: sein Haupt- und Seitenteil
// sind Rasterzellen, die übrigen Blöcke (eigene Formulare wie Kommentar, Löschen) daneben — so steht der
// Verlauf links unter der Beschreibung, obwohl er nicht im selben <form> liegen darf.
export const TICKET_SEITE = "grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,1fr)_22rem]";

/** Zelle links unter dem Formular-Hauptteil (Verlauf = Zeile 2, Kosten = 3, Anhänge = 4). */
export const linkeZelle = (zeile: 2 | 3 | 4) =>
  ({ 2: "xl:col-start-1 xl:row-start-2", 3: "xl:col-start-1 xl:row-start-3", 4: "xl:col-start-1 xl:row-start-4" })[zeile];
