/** Deliberately non-catalog text to expose accidental template restoration. */
export function directionCard(title = 'Comparing feedback in a tiny learning game') {
  return {
    directionId: null as string | null, catalogDirectionId: null as string | null,
    backgroundEvidence: [] as string[],
    title, field: 'Education and game design', question: 'Does immediate feedback help a beginner notice one mistake?',
    description: 'Compare two paper versions of a three-question game.', reason: 'A manageable experiment for someone interested in learning games.',
    activities: ['Draw two feedback screens', 'Compare the feedback timing'], firstStep: 'Sketch one example question on paper.',
    skills: ['Operationalizing a question'], tags: ['education'], resourceUrls: [] as string[],
  };
}
