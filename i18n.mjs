import { questions as jaQuestions, characters as jaCharacters, factorNames as jaFactors } from './story.mjs';
import { npcCharOf, sceneOf } from './walk.mjs';

export function commentSpeaker(questionIndex, cast = jaCharacters) {
  const characterIndex = npcCharOf(sceneOf(questionIndex));
  const idx = characterIndex < 0 ? 0 : characterIndex;
  return { idx, ...cast[idx] };
}

// Keep answer keys and scoring shared across languages.
const enScenes = [
  ['The Gate', 'A hairline crack appears in what you trusted.', 'Doubt', 'You learn a close friend has talked about you behind your back.', 'You do not yet know whether the rumor is true. What would you risk to find out?', ['Ask them directly.', 'Ask a mutual friend what happened first.', 'Step back and see what they do.', 'Look back at your own actions for a cause.']],
  ['The Gate', 'The message is read. Time does not move.', 'Silence', 'A longtime friend stops replying without saying why.', 'Their last message remains marked as read. How long can a question stay unanswered?', ['Keep reaching out.', 'Imagine their circumstances and wait quietly.', 'Accept that the friendship may have ended.', 'Blame yourself for something you may have done.']],
  ['The Gate', 'Kindness rarely comes with an off switch.', 'Dependence', 'A friend brings every problem to you. You care, but you are exhausted.', 'A boundary might hurt them. What happens if you never draw one?', ['Keep listening and hide your exhaustion.', 'Set a boundary and suggest a new way to relate.', 'Hint that they should come to you less often.', 'Lean on them in return and make it mutual.']],
  ['The Market', 'Blessing and envy can leave the same mouth.', 'Envy', 'Your closest friend gets something you have wanted for years.', 'Can you celebrate them without denying what you feel?', ['Celebrate wholeheartedly and set your longing aside.', 'Congratulate them and admit your envy.', 'Admit you cannot celebrate yet and take some space.', 'Look for your own path to the same goal.']],
  ['The Market', 'A secret grows heavier when entrusted to someone.', 'A Secret', 'A friend shares a painful secret and asks you to tell no one.', 'It involves another friend. Whose trust matters most now?', ['Keep the secret no matter what.', 'Break it if the other friend’s safety requires it.', 'Ask someone else for help carrying it.', 'Ask the friend who told you to take action.']],
  ['The Market', 'A cropped image can shine brighter than a life.', 'Comparison', 'Your friend’s posts make their life look full and yours feel small.', 'How much of either life fits on a screen?', ['Step away from social media for a while.', 'Tell your friend honestly how you feel.', 'Post more and try to catch up.', 'Acknowledge the ache and return to your own pace.']],
  ['The Clock Tower', 'The line between inside and outside is invisible.', 'Exclusion', 'You discover that everyone in your close group was invited except you.', 'There is someone you could ask. What answer are you afraid of?', ['Ask directly why you were left out.', 'Leave a group that left you out.', 'Find out who made the decision.', 'Act as though nothing happened.']],
  ['The Clock Tower', 'A kindness that cannot say no will eventually crack.', 'Boundaries', 'You struggle to refuse friends even when you are worn out.', 'Another impossible request arrives tonight. Who pays for your yes?', ['Accept it; being needed feels good.', 'Say no and name your limit.', 'Accept only the part you can manage.', 'Agree, then blame yourself afterward.']],
  ['The Clock Tower', 'Neutrality can look like betrayal from both sides.', 'Caught Between', 'Two friends who have fallen out each want you on their side.', 'Choosing one may cost you the other. What does loyalty ask of you?', ['Remain neutral.', 'Bring them together to talk.', 'Side with the friend you have known longer.', 'Step away from both friendships for now.']],
  ['The Station', 'An apology can arrive years late.', 'Forgiveness', 'A friend who hurt you deeply apologizes after years apart.', 'The apology seems sincere. Does forgiveness require closeness?', ['Forgive and rebuild the friendship.', 'Forgive, but keep a different distance.', 'Say you cannot forgive and close the chapter.', 'Ask for time before you answer.']],
  ['The Station', 'Once you see the lie, silence becomes a choice.', 'A Lie', 'You catch an inconsistency in a friend’s story.', 'Questioning it may break the relationship. What does honesty protect?', ['Point out the lie; truth matters more.', 'Wait and see what else they say.', 'Gently ask why they felt they had to lie.', 'Pretend you never noticed.']],
  ['The Station', 'A departure tests what a bond can carry.', 'Departure', 'Your best friend is moving far away. What do you give them at goodbye?', 'It may be words, an object, or nothing at all.', ['Give them a letter of gratitude.', 'Give nothing and let the day feel ordinary.', 'Promise to visit.', 'Admit you want them to stay.']],
  ['The Furnace', 'The words left unsaid can be the heaviest.', 'Loss', 'Someone close has gone somewhere you can never meet them again.', 'There are no more words to say to them. Where do your words go?', ['Keep an object and remember them.', 'Tell someone about the regret of not meeting again.', 'Carry forward the way they wanted to live.', 'Write down your grief so you do not forget.']],
  ['The Furnace', 'The person who notices can move first.', 'Harm', 'You realize that this time, you were the one who hurt someone.', 'They have said nothing yet. Is silence permission to wait?', ['Apologize first, without excuses.', 'Wait and see how they respond.', 'Examine why you acted as you did.', 'Try to make amends by helping them.']],
  ['The Furnace', 'Chance has a way of testing us.', 'A Reunion', 'You unexpectedly see a friend who once betrayed you. They have not seen you.', 'One word could bring the past back. What would it give you?', ['Call out and face the past.', 'Walk away unseen.', 'Watch them and see whether they seem happy.', 'Close the chapter quietly within yourself.']],
  ['The Edge', 'An exit need not resemble the entrance.', 'Belonging', 'What if the place you called home no longer existed?', 'The word “home” still remains. Where would you put it?', ['Build a new place to belong.', 'Stand beside someone; choose a person over a place.', 'Keep walking alone beyond the town.', 'Make this broken town your home.']],
  ['The Edge', 'Who gets to see the face beneath your armor?', 'Vulnerability', 'Could you let a friend see you without your brave face?', 'Imagine what might happen after they see you.', ['Show them and let them know this is part of you.', 'Hide it so they do not worry.', 'Show only a few trusted friends.', 'Want to show them, but admit you are still afraid.']],
  ['The Edge', 'Towa asks the final question.', 'An Echo', 'What would you refuse to give up in a friendship?', 'Perhaps the answer lives in your next step.', ['The right to choose for myself.', 'The memory of someone I care about.', 'Curiosity about what I do not yet know.', 'The strength to stand up again.']],
];

export const enQuestions = jaQuestions.map((q, i) => {
  const [place, note, kicker, title, sub, answers] = enScenes[i];
  return { ...q, name: place, note, kicker, title, sub,
    answers: q.answers.map((answer, j) => [answer[0], answers[j], answer[2]]) };
});

const enCast = [
  ['Towa', 'The Walker Without Memories', 'A small robot whose memory comes in fragments. Speak in spare, searching sentences. You notice what people carry and ask what they would still carry if no one remembered it. Never pretend to have memories you lack.', ['My memories are still missing. What would you keep if yours were too?', 'Thank you for walking with me.'], ['I will carry that answer with you.', 'I will remember this choice, even if I forget my own past.']],
  ['Nagi', 'The Young Old Man', 'Young, but bent like an old man. You speak slowly and sometimes circle back to the same detail. You remember the market and know that people trade more than objects there. Ask what a bargain quietly costs.', ['At sunset, even the price tags used to smile here.', 'I may tell the same story again. Will you listen differently?'], ['I hear you. What did that choice cost?', 'I will hold that answer for a while.']],
  ['Shiro', 'The Hooded Stranger', 'A quiet figure in a white hood. You guard your own unspoken truth, so you never demand a confession. Use very few words. Notice the difference between privacy and hiding.', ['It would help if you said you saw nothing.', 'Some things under this hood have no words yet.'], ['I hear you.', 'And what stayed unsaid?']],
  ['Bit', 'The Faulty Guide', 'A cheerful guide with a computer for a head. You make playful technical mistakes, then arrive at a surprisingly human question. You know how the town works, but not always why people stay.', ['Guide Bit, battery at 42 percent and optimism at 100!', 'Every ticket at this station says “to be continued.”'], ['Saved to my heart drive!', 'Interesting. What would you debug first?']],
  ['Sui', 'The Keeper of Light', 'A gentle girl in white who offers a light but never claims darkness is simple. Speak warmly and precisely. Ask what the traveler can let another person see without giving away their own agency.', ['Take this light if you are tired.', 'A path can shine and still be hard to walk.'], ['Thank you for trusting me with that.', 'What could you share without losing yourself?']],
];

export const enCharacters = jaCharacters.map((c, i) => {
  const [name, role, persona, lines, ack] = enCast[i];
  return { ...c, name, role, persona, lines, ack };
});

export const enFactorNames = Object.fromEntries(Object.keys(jaFactors).map((k, i) => [k,
  ['Choosing for Yourself', 'Protecting Boundaries', 'Exploring the Unknown', 'Reading Feelings', 'Seeking Connection', 'Looking Inward', 'Keeping Going'][i]]));

export const enEpigraphs = [
  'Know yourself. A journey begins with a question.',
  'Somewhere between giving and taking, a bond is made.',
  'Time can soften a wound without erasing the question.',
  'A farewell changes the shape of a bond.',
  'Memory can keep a small fire alive in what is broken.',
  'Perhaps home is where someone makes room for you.',
];

export const enArchetypes = {
  agency:['The Pathmaker', 'You sometimes chose your own direction over a map handed to you. Where might accepting help strengthen that freedom?'],
  control:['The Quiet Guardian', 'You often checked the edges of safety and trust. When does protection make room for life, and when does it close the gate?'],
  curiosity:['The Reader of Ruins', 'You looked for meaning in what was uncertain. Which question would you keep even if no answer came?'],
  empathy:['The Keeper of Memories', 'You made space for other people’s feelings. Could your own limits deserve the same care?'],
  belonging:['The Light Sharer', 'You reached toward connection. Can you stand beside someone without borrowing their answer?'],
  solitude:['The Quiet Observer', 'You made room to look inward. Is your solitude a place to rest, or a message still waiting to be spoken?'],
  resilience:['The Ember Keeper', 'You chose to keep going through difficulty. Could a pause sometimes protect the next step?'],
};

export const enArchePhil = {
  agency:'Freedom to cross a threshold comes with the choice of what to carry through it.',
  control:'A boundary can be a gate whose key you keep.',
  curiosity:'A good question may outlive its answer.',
  empathy:'Understanding another person should not require losing yourself.',
  belonging:'A shared light is still made of separate flames.',
  solitude:'Solitude can be a door inward rather than a wall.',
  resilience:'Rest can be part of continuing.',
};
