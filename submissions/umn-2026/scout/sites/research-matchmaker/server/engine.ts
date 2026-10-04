import type { AgentAction, AgentRequest, AgentResponse, Direction, EmailDraft, PlanTask, Professor, SessionState, StudentProfile } from '../shared/types';
import { directions, professors } from './catalog';
import { AgentError } from './errors';
import { getVerifiedWebProfessor, webFacultyMatchesSchool } from './web-faculty';

const clone = <T>(value: T): T => structuredClone(value);
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const umnAliases = new Set(['umn', 'u of m', 'university of minnesota', 'university of minnesota twin cities', 'minnesota', '明尼苏达大学', '明大']);
export function sameSchool(a: string, b: string) {
  const left = normalize(a); const right = normalize(b);
  return !!left && !!right && (left === right || (umnAliases.has(left) && umnAliases.has(right)));
}
const relatedTerms: Record<string, string[]> = {
  'human-computer-interaction': ['hci', 'interface', 'design', 'usability', 'human', 'people', 'technology', 'accessibility', 'education', 'learning app', '人机', '界面', '设计', '教育', '用户'],
  'recommender-systems': ['recommend', 'recommendation', 'recommender', 'personaliz', 'discovery', 'spotify', 'netflix', 'machine learning', '推荐', '个性化', '机器学习'],
  'learning-analytics': ['learning', 'education', 'teaching', 'student', 'school', 'educational', '学习', '教育', '教学'],
  bioinformatics: ['bio', 'biology', 'genetics', 'genome', 'dna', 'protein', 'health', 'medicine', '生物', '基因', '医疗', '生命'],
  'ecology-conservation': ['ecology', 'environment', 'climate', 'conservation', 'animal', 'plant', 'nature', 'wildlife', '生态', '环境', '动物', '保护'],
  neuroscience: ['brain', 'neuro', 'cognition', 'memory', 'psychology', '脑', '神经', '认知', '心理'],
  robotics: ['robot', 'hardware', 'sensor', 'autonomous', 'mechanical', 'build', '机器人', '硬件', '自动驾驶'],
  'social-behavioral-science': ['social', 'behavior', 'society', 'community', 'inequality', 'psychology', 'people', '社会', '行为', '人类', '心理'],
};

function matches(text: string, term: string): boolean {
  if (/[\u3400-\u9fff]/u.test(term)) return text.includes(term);
  return new RegExp(`(?:^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);
}
export function searchDirections(query: string, profile?: StudentProfile, excludeIds: string[] = []): Direction[] {
  const text = `${query} ${profile?.interests || ''} ${profile?.goal || ''} ${profile?.major || ''}`.toLowerCase();
  const ranked = directions.filter(direction => !excludeIds.includes(direction.id)).map((direction, index) => {
    const terms = [...new Set([...(relatedTerms[direction.id] || []), ...direction.tags.map(tag => tag.toLowerCase())])];
    const hit = terms.filter(term => matches(text, term));
    const titleMatch = text.includes(direction.title.toLowerCase()) ? 10 : 0;
    return { direction, index, hit, score: hit.length + titleMatch };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, 3).map(({ direction, hit, score }) => ({
    ...clone(direction),
    why: score > 0 ? `This option connects to ${hit.length ? hit.slice(0, 2).join(' and ') : direction.title}. ${direction.why}` : `An alternative to compare while your interests take shape. ${direction.why}`,
  }));
}
export function findFaculty(school: string, directionId: string, candidates: Professor[] = []): Professor[] {
  const verified = candidates.map(item => professors.find(candidate => candidate.id === item.id) || getVerifiedWebProfessor(item.id)).filter((item): item is Professor => !!item);
  const catalog = [...new Map([...professors, ...verified].map(item => [item.id, item])).values()];
  return catalog.filter(professor => (sameSchool(school, professor.university) || webFacultyMatchesSchool(professor.id, school)) && professor.directionIds.includes(directionId)).slice(0, 3).map(clone);
}
export function getDirection(id: string | null | undefined): Direction {
  const direction = directions.find(item => item.id === id);
  if (!direction) throw new AgentError(400, 'Choose a research direction first.', 'DIRECTION_REQUIRED');
  return clone(direction);
}

export function createPlan(direction: Direction, hours: number, simple = false): PlanTask[] {
  const budget = Math.round(hours * 60);
  const first = Math.max(5, Math.round(budget * 0.25));
  const second = Math.max(5, Math.round(budget * 0.25));
  const third = budget - first - second;
  const resource = direction.resources[0] || null;
  return [
    { id: `${direction.id}-${budget}-${simple ? 'simple-' : ''}read`, title: simple ? 'Read just the introduction' : 'Understand one research question', description: simple ? `Skim the first section of the resource. Write one sentence about ${direction.question}` : `Use the introductory resource to explore: ${direction.question} Stop when your time is up; you do not need to finish a course.`, minutes: first, output: 'One research question in your own words.', completed: false, resource },
    { id: `${direction.id}-${budget}-${simple ? 'simple-' : ''}learn`, title: simple ? 'Learn one useful term' : 'Build one useful foundation', description: `Choose one unfamiliar concept from ${direction.skills.slice(0, 3).join(', ') || 'the introduction'}. ${simple ? 'Define it in a sentence and find an everyday example.' : 'Use the resource to explain it and connect it to the research question.'}`, minutes: second, output: simple ? 'One definition and one example.' : 'A short explanation of one concept, with an example.', completed: false, resource: direction.resources[1] || resource },
    { id: `${direction.id}-${budget}-${simple ? 'simple-' : ''}try`, title: simple ? 'Try a tiny observation' : 'Make something to discuss', description: `${direction.firstStep} ${simple ? 'Keep it to one observation and one question.' : 'Keep the work within this time budget and note what interested or confused you.'}`, minutes: third, output: simple ? 'One observation and a question for a professor.' : 'A one-page note with your question, observation, and next question.', completed: false, resource: null },
  ];
}

function addExplicit(current: string, fact: string, limit: number) {
  const clean = fact.trim().replace(/^[,;，；\s]+|[,;，；\s]+$/g, '');
  if (!clean || current.toLowerCase().includes(clean.toLowerCase())) return current;
  return (current ? `${current}\n${clean}` : clean).slice(0, limit);
}
/** Only preserves explicit first-person clauses. A mentioned skill is not proficiency. */
function looksLikeSchoolName(value: string, allowShortName: boolean, explicitlyNamed = false): boolean {
  const text = value.trim().replace(/[.!。！]$/, '');
  if (text.length < 2 || text.length > 150 || /[?？\n]/.test(text)) return false;
  if (/^(?!我|你|如何|哪个).{2,80}(?:大学|学院)$/.test(text)) return true;
  if (/^[A-Z]{2,10}$/.test(text)) return allowShortName && !/^(?:OK|NO|YES|HELP|THANKS|IDK|SURE)$/.test(text);
  const words = text.split(/\s+/);
  const namedInstitution = /\b(?:University|College|Institute|School|Academy|Polytechnic)\b/i.test(text);
  return (namedInstitution || explicitlyNamed) && words.length <= 12 && words.every(word => /^(?:of|the|and|at|de|in|for|&)$/.test(word) || /^\p{Lu}[\p{L}\p{N}'’().–-]*$/u.test(word));
}

export function extractProfile(profile: StudentProfile, message: string, awaitingSchool = false): StudentProfile {
  const result = { ...profile };
  const clauses = message.split(/(?:[.!?\n;；。！？]|,(?=\s*(?:I\b|my\b))|，(?=我)|\band\s+(?=I\b))/i).map(value => value.trim()).filter(Boolean);
  for (const clause of clauses) {
    if (/\b(?:I(?:'m| am)?\s+(?:interested|curious)|I\s+(?:like|love|enjoy|care about)|my interests?)\b|(?:我.*(?:感兴趣|喜欢|想了解)|感兴趣的是)/i.test(clause)) {
      result.interests = addExplicit(result.interests, clause, 3000);
    }
    if (/\b(?:I\s+(?:know|learned|learnt|studied|built|completed|took)|I\s+have\s+(?:experience|a background|basic|some)|my\s+(?:experience|background))\b|我(?:会|学过|做过|完成过|有.{0,12}经验)|(?:会一点|学过|熟悉).{1,60}/i.test(clause)) {
      result.experience = addExplicit(result.experience, clause, 16000);
    }
  }
  const time = message.match(/(?:\b(?:I\s+(?:have|can(?:\s+commit|\s+spend)?|am available)|my\s+(?:budget|availability))[^.!?\n]{0,30}?)(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)(?:\s*(?:a|per|each|\/)?\s*week)?/i) || message.match(/每周[^\d]{0,12}(\d+(?:\.\d+)?)\s*(?:个)?小时/);
  if (time) { const hours = Number(time[1]); if (hours >= 0.5 && hours <= 40) result.hoursPerWeek = hours; }
  const school = message.match(/(?:\bI\s+(?:attend|study at|go to)|\bmy (?:school|university) is)\s+([^.!?\n,;，；。]{2,150})/i)?.[1] || message.match(/(?:我(?:的学校是|在))\s*([^\n,，。！？]{2,80}(?:大学|学院))/)?.[1];
  if (school && looksLikeSchoolName(school, true, true)) result.school = school.trim();
  else if (!result.school && looksLikeSchoolName(message, awaitingSchool)) result.school = message.trim().replace(/[.!。！]$/, '');
  return result;
}

function clearConnection(state: SessionState) {
  state.professors = []; state.selectedProfessorId = null; state.draft = null;
}
function clearDirection(state: SessionState) {
  state.selectedDirectionId = null; state.tasks = []; clearConnection(state);
}
export function createEmail(profile: StudentProfile, professor: Professor, direction: Direction): EmailDraft {
  const name = profile.name.trim() || '[Your name]';
  const school = profile.school.trim() || '[Your university]';
  const student = [profile.year.trim(), profile.major.trim()].filter(Boolean).join(' ') || '[your year and major]';
  const background = profile.experience.trim();
  const experience = background ? `My current background is: ${background.length > 1600 ? `${background.slice(0, 1600)}\n[Shorten this background to relevant, complete and accurate details before sending.]` : background}` : '[Add one accurate sentence about your current coursework or experience.]';
  const firstSource = professor.sources[0];
  return {
    professorId: professor.id,
    subject: `Undergraduate interest in ${direction.title.toLowerCase()}`,
    body: `Dear Professor ${professor.name},\n\nMy name is ${name}, and I am a ${student} student at ${school}. I am exploring ${direction.title.toLowerCase()}. Your public research description mentions ${professor.research.replace(/[.。]$/, '')}.${firstSource ? `\nReference: ${firstSource.url}` : ''}\n\n${experience}\nI can currently set aside about ${profile.hoursPerWeek} hours each week. I would like to ask: ${professor.conversationStarter}\n\nAre there opportunities for an undergraduate to contribute to related work, or a first step you would recommend? If convenient, would you be open to a brief conversation?\n\nThank you for your time,\n${name}`,
    checklist: ['Replace every bracketed placeholder and check your background.', 'Open the source and make sure you understand the research connection.', 'Confirm the professor’s contact address on their official page.', 'Availability is unknown; this draft does not claim an open position.', 'Review and send it yourself. The agent does not send email.'],
  };
}

/** Client state is a convenience, never an authority for faculty facts or links. */
export function sanitizeState(input: SessionState): SessionState {
  const state = clone(input);
  state.directions = state.directions.map(item => getDirection(item.id));
  const direction = directions.find(item => item.id === state.selectedDirectionId);
  if (!direction) { clearDirection(state); state.stage = state.directions.length ? 'explore' : 'discover'; return state; }
  if (!state.directions.some(item => item.id === direction.id)) state.directions.push(clone(direction));
  const budget = Math.round(state.profile.hoursPerWeek * 60);
  const simple = state.tasks.some(task => task.id.includes('-simple-'));
  const expected = createPlan(direction, state.profile.hoursPerWeek, simple);
  const oldTasks = state.tasks;
  if (oldTasks.some(task => !task.id.startsWith(`${direction.id}-`))) clearConnection(state);
  state.tasks = oldTasks.length ? expected.map(task => ({ ...task, completed: oldTasks.some(old => old.id === task.id && old.completed) })) : [];
  if (oldTasks.length && oldTasks.reduce((sum, task) => sum + task.minutes, 0) !== budget) state.draft = null;
  const available = findFaculty(state.profile.school, direction.id, state.professors);
  state.professors = state.professors.map(item => available.find(candidate => candidate.id === item.id)).filter((item): item is Professor => !!item);
  const selected = state.professors.find(item => item.id === state.selectedProfessorId);
  if (!selected) { state.selectedProfessorId = null; state.draft = null; }
  else if (state.draft?.professorId !== selected.id) state.draft = null;
  state.stage = state.draft ? 'outreach' : state.professors.length ? 'connect' : state.tasks.length ? 'plan' : 'explore';
  return state;
}

export function inferAction(req: AgentRequest, state: SessionState): { action: AgentAction; directionId?: string; professorId?: string } {
  if (req.action !== 'chat') return { action: req.action, directionId: req.directionId, professorId: req.professorId };
  const text = req.message.toLowerCase();
  if (state.selectedDirectionId && state.profile.school.trim() && req.state.stage === 'connect' && (!req.state.profile.school.trim() || state.profile.school !== req.state.profile.school)) return { action: 'find_professors' };
  // Questions about existing work do not authorize replacing that work.
  if (/^(?:what|how|why|when|where|which|i wonder|i am wondering|i'm wondering)\b|^(?:is|are|does|do|should|would|could|can)\s+(?!you\b)|^(?:如何|怎么|为什么|什么时候|是否|应该|我该)|\b(?:don't|do not|never)\s+(?:rewrite|regenerate|reset|change|create|make|simplify)\b|(?:不要|别)(?:重写|生成|改|重置)/i.test(text)) return { action: 'chat' };
  const requestPrefix = '(?:(?:please|now)\\s+|(?:can|could|would|will)\\s+you\\s+|(?:i\\s+(?:want|would like)|i\'d like)\\s+(?:you\\s+)?to\\s+|(?:help me|let\'s|lets)\\s+)*';
  const asksTo = (verb: string, target: string) => new RegExp(`^${requestPrefix}(?:${verb})\\b[^.!?\\n]{0,55}\\b(?:${target})\\b`, 'i').test(text);
  const simplify = asksTo('simplify', 'this|it|plan|tasks|week') || asksTo('make', 'easier|simpler') || /^(?:simplify|simpler)(?:\s+please)?[.!]?$/i.test(text) || /^(?:please\s+)?(?:lower|reduce)\s+(?:the\s+)?difficulty/i.test(text) || /^(?:请|帮我|请帮我)?(?:降低难度|简单一点|简化(?:计划|任务))/.test(text);
  if (simplify && state.selectedDirectionId) return { action: 'simplify_plan' };
  if ((asksTo('write|draft|create|generate|regenerate|rewrite|redraft|revise|update', 'email|outreach|message') || /^(?:请|帮我|请帮我|我想)?(?:重新)?(?:写|生成|修改|重写).{0,15}(?:邮件|联系信)/.test(text)) && state.selectedProfessorId) return { action: 'draft_email', professorId: state.selectedProfessorId };
  if (/find.{0,25}(?:professor|faculty|mentor)|(?:professor|faculty|mentor).{0,25}(?:find|contact)|找.{0,10}(?:教授|导师)|联系教授/.test(text) && state.selectedDirectionId) return { action: 'find_professors' };
  if (/(?:choose|select|pick|explore|选择|选|探索)/i.test(text)) {
    const direction = state.directions.find(item => text.includes(item.title.toLowerCase()) || text.includes(item.id));
    if (direction) return { action: 'select_direction', directionId: direction.id };
  }
  if ((asksTo('create|make|build|generate|regenerate|reset|update|revise|write', 'plan') || asksTo('plan', 'week|tasks') || /^i\s+(?:want|need|would like)\s+(?:a\s+)?(?:new\s+|weekly\s+|preparation\s+)*plan\b/.test(text) || /^(?:请|帮我|请帮我|我想)?(?:重新)?(?:制定|生成|创建|更新).{0,10}计划/.test(text)) && state.selectedDirectionId) return { action: 'create_plan' };
  if (/recommend|new directions|different direction|换.{0,6}方向|推荐|换方向/.test(text)) return { action: 'recommend' };
  if (state.profile.interests !== req.state.profile.interests || (!state.directions.length && (state.profile.interests || state.profile.goal || state.profile.major))) return { action: 'recommend' };
  return { action: 'chat' };
}

export function runDemo(req: AgentRequest, override?: { action: AgentAction; directionId?: string; professorId?: string }): AgentResponse {
  let state = sanitizeState(req.state);
  state.profile = extractProfile(state.profile, req.message, req.state.stage === 'connect' && !req.state.profile.school.trim());
  state = sanitizeState(state);
  // Rebuild tasks when a student explicitly changes their weekly availability in chat.
  if (state.tasks.length && state.selectedDirectionId && state.tasks.reduce((sum, task) => sum + task.minutes, 0) !== Math.round(state.profile.hoursPerWeek * 60)) {
    state.tasks = createPlan(getDirection(state.selectedDirectionId), state.profile.hoursPerWeek);
    state.draft = null;
  }
  const decision = override || inferAction(req, state);
  let reply = ''; let suggestions: string[] = []; const toolActivity: string[] = [];
  switch (decision.action) {
    case 'chat':
      if (/meeting|introduce|first conversation|见面|自我介绍/i.test(req.message)) {
        reply = 'Start with your current year and interests, then describe one small thing you explored. Ask what undergraduates usually do, what preparation matters for that specific task, and how time and supervision work. Bring one honest question from the professor’s public research page; you do not need to pretend you already understand the whole field.';
      } else if (/no(?:t)?\s+reply|does(?:n't| not) reply|没有回复|不回复/i.test(req.message)) {
        reply = 'A missing reply does not say whether you belong in research. Check the professor’s published contact instructions, then consider one short, polite follow-up. Meanwhile, continue your small exploration task and look at another relevant professor or your undergraduate research office.';
      } else if (/email|outreach|邮件|联系信/i.test(req.message)) {
        reply = 'Keep the email short enough to read quickly: a brief introduction, one specific research connection, an accurate sentence about your current experience, and one clear request. Remove repeated details and anything you could not comfortably explain in a conversation. Your current draft is unchanged; you can edit it directly or explicitly ask me to rewrite it.';
      } else if (/plan|task|计划|任务/i.test(req.message) && state.selectedDirectionId) {
        reply = `Your current plan uses ${state.profile.hoursPerWeek} hours: understand one research question, learn one relevant concept, then make a small piece of work to discuss. The time estimates are limits, not requirements to finish an entire resource. Your tasks and completed steps are unchanged. Tell me what feels unclear, or ask me to simplify the plan.`;
      } else if (state.directions.length) {
        reply = state.selectedDirectionId ? `You are currently exploring ${getDirection(state.selectedDirectionId).title.toLowerCase()}. What felt interesting or difficult in the first task? I can simplify the plan, help find professors at your school, or suggest different directions.` : 'Compare the research questions and the daily activities on the cards. Pick one small task to try, then ask yourself whether you enjoyed the question, the method, or both. Your first choice is an experiment; you can change directions after trying it.';
      } else reply = 'Let’s start with one small question: what is a problem you would enjoy understanding or improving? You can think about people, health, technology, nature, or something from everyday life. You do not need a major or research experience to begin.';
      suggestions = state.selectedDirectionId ? ['Find professors at my university', 'Make this easier'] : state.directions.length ? ['I want a different direction'] : ['I like education and how people use technology', 'I am interested in biology and health', 'I enjoy understanding people and communities'];
      break;
    case 'recommend': {
      const excluded = /different direction|another direction|new direction|换.{0,6}方向|其他方向/i.test(req.message) ? state.directions.map(direction => direction.id) : [];
      clearDirection(state);
      state.directions = searchDirections(req.message, state.profile, excluded); state.stage = 'explore';
      toolActivity.push('Searched the curated research direction catalog');
      reply = `Here are ${state.directions.length} directions to compare. Each is an option to try, not a judgment of your potential. Start with the question that makes you most curious, and use its small exploration task to see how it feels. These suggestions come from our limited starter catalog; you can change your interests at any time.`;
      suggestions = ['How should I compare these directions?', 'I want a different direction']; break;
    }
    case 'select_direction':
    case 'create_plan':
    case 'simplify_plan': {
      const direction = getDirection(decision.directionId || state.selectedDirectionId);
      if (state.selectedDirectionId !== direction.id) { state.tasks = []; clearConnection(state); }
      state.selectedDirectionId = direction.id;
      if (!state.directions.some(item => item.id === direction.id)) state.directions.push(direction);
      state.tasks = createPlan(direction, state.profile.hoursPerWeek, decision.action === 'simplify_plan');
      state.draft = null; state.stage = 'plan';
      toolActivity.push(`Retrieved starter learning resources for ${direction.title}`);
      reply = `Let’s try ${direction.title.toLowerCase()} for one week. Your plan fits ${state.profile.hoursPerWeek} hours, with three small tasks and something concrete to discuss. ${decision.action === 'simplify_plan' ? 'I reduced the scope while keeping your time budget. ' : ''}Stop at the time limit rather than trying to finish a whole course. You can contact a professor while learning.`;
      suggestions = ['Find professors at my university', 'Make this easier']; break;
    }
    case 'find_professors': {
      const direction = getDirection(state.selectedDirectionId);
      const candidates = state.professors;
      clearConnection(state); state.professors = findFaculty(state.profile.school, direction.id, candidates); state.stage = 'connect';
      toolActivity.push(`Checked faculty catalog for ${state.profile.school || 'your university'} and ${direction.title}`);
      reply = !state.profile.school.trim() ? 'Which university do you attend? Add its full name in your profile so I can look for relevant professors at your school. I will not assume a university for you.' : state.professors.length ? `I found ${state.professors.length} research-relevant ${state.professors.length === 1 ? 'professor' : 'professors'} at ${state.profile.school}. Their public pages support the research connection; whether they are currently accepting undergraduates is unknown. Open a source, find one question you actually want to ask, then choose a professor for an email draft.` : `I do not have a verified ${direction.title.toLowerCase()} faculty match for ${state.profile.school} in this starter catalog. That is a gap in our catalog, not evidence that no opportunities exist. Check your university’s department and undergraduate research pages, or update your school and direction. I will not substitute a professor from another university.`;
      suggestions = state.professors.length ? ['What should I ask at a first meeting?', 'How do I introduce myself?'] : ['Help me prepare while I search']; break;
    }
    case 'draft_email': {
      const direction = getDirection(state.selectedDirectionId);
      const professorId = decision.professorId || state.selectedProfessorId;
      const professor = findFaculty(state.profile.school, direction.id, state.professors).find(item => item.id === professorId);
      if (!professor || !state.professors.some(item => item.id === professor.id)) throw new AgentError(400, 'Choose a current professor match before drafting an email.', 'PROFESSOR_REQUIRED');
      state.selectedProfessorId = professor.id; state.draft = createEmail(state.profile, professor, direction); state.stage = 'outreach';
      toolActivity.push(`Prepared a draft using ${professor.name}’s catalog sources and your provided background`);
      reply = `Your draft for Professor ${professor.name} is ready to review. It uses only your provided background and the public research description. Fill in every bracketed placeholder, open the source, and confirm the contact details before sending it yourself. No email has been sent.`;
      suggestions = ['What should I ask at a first meeting?', 'What if the professor does not reply?']; break;
    }
  }
  return { state, reply, suggestions, mode: req.mode, toolActivity };
}
