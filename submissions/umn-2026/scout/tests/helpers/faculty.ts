import { professors } from '../../server/catalog';
export function facultyGuidance(name: string) {
  const p = professors.find(p => p.name.toLowerCase().includes(name.toLowerCase()))!;
  return { fit: 'Use the cited research description to explore a possible connection.', question: p.conversationStarter, experience: '', preparation: 'Read the cited faculty profile and write one question.', studentEvidence: [], sourceEvidence: p.research };
}
