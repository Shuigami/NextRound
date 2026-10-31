// Définitions générales des termes. Les règles propres à une édition viennent de ses fichiers de règles.
export const GLOSSARY = {
  bo: { term: "BO (best-of)", def: "« Au meilleur des N manches ». En BO3, la première équipe à 2 manches gagne. En BO5, il en faut 3. Le match s'arrête dès que c'est joué." },
  ft: { term: "FT (first-to)", def: "« Premier à N manches ». En FT3, il faut gagner 3 manches. Proche du BO5, mais le règlement peut prévoir des manches nulles ou un nombre maximal de manches." },
  round_robin: { term: "Poule (round robin)", def: "Chaque équipe affronte toutes les autres de sa poule. Le classement final se fait au nombre de victoires." },
  swiss: { term: "Ronde suisse", def: "On n'affronte pas tout le monde. À chaque ronde, les équipes au même bilan s'affrontent. Les meilleures se qualifient vite, les moins bonnes sortent vite." },
  single_elimination: { term: "Élimination directe", def: "Tableau où chaque défaite élimine. Le vainqueur d'un match avance au tour suivant." },
  double_elimination: { term: "Double élimination", def: "Il faut perdre deux fois pour sortir. Une première défaite envoie dans le tableau de repêchage." },
  lower_bracket: { term: "Repêchage (lower bracket)", def: "Tableau des équipes qui ont déjà perdu une fois. Une nouvelle défaite y est éliminatoire." },
  upper_bracket: { term: "Tableau principal (upper bracket)", def: "Tableau des équipes encore invaincues dans une double élimination." },
  grand_final: { term: "Grande finale", def: "Dernier match d'une double élimination. Il oppose le vainqueur du tableau principal à celui du repêchage." },
  bracket_reset: { term: "Bracket reset", def: "Dans certains règlements, si l'équipe du repêchage gagne la grande finale, une seconde finale est jouée. Chaque équipe a alors perdu une fois." },
  tiebreaker: { term: "Départage", def: "Règle qui sépare des équipes à égalité : confrontation directe, différence de manches ou match d'appui, selon le règlement." },
  head_to_head: { term: "Confrontation directe", def: "En cas d'égalité entre deux équipes, celle qui a gagné leur match passe devant." },
  seed: { term: "Tête de série", def: "Place attribuée selon les résultats précédents. Elle détermine les adversaires dans le tableau." },
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
