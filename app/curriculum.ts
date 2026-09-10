export type Register = 'neutral' | 'polite' | 'casual' | 'formal' | 'Taglish';

export type Phrase = {
  id: string;
  fil: string;
  en: string;
  register: Register;
  note: string;
  accepted?: string[];
};

export type Unit = {
  id: string;
  number: number;
  title: string;
  titleFil: string;
  description: string;
  canDo: string;
  minutes: number;
  soundFocus: string;
  pattern: {
    frame: string;
    transform: string;
    note: string;
  };
  phrases: Phrase[];
  dialogue: {
    situation: string;
    line: string;
    reply: string;
    alternatives: string[];
    note: string;
  };
};

export const units: Unit[] = [
  {
    id: 'greetings',
    number: 1,
    title: 'Greetings & repair',
    titleFil: 'Kumusta ka?',
    description: 'Say hello, be polite, and keep a conversation going.',
    canDo: 'I can greet someone and ask them to repeat something.',
    minutes: 10,
    soundFocus:
      'Keep each vowel clear and stress the last syllable in ku-mus-TA. Within a word, “ng” is the single sound heard in “singer” and can begin a Tagalog word. The standalone marker “ng,” as in “Gusto ko ng kape,” is pronounced “nang.”',
    pattern: {
      frame: 'Maganda + -ng + [time of day]',
      transform: 'Magandang hapon → Magandang umaga',
      note: 'The linker “-ng” joins the description to the noun that follows.',
    },
    phrases: [
      {
        id: 'kumusta',
        fil: 'Kumusta?',
        en: 'Hi. / How are things?',
        register: 'neutral',
        note: 'A natural standalone greeting. “Kumusta ka?” explicitly asks one familiar person how they are.',
        accepted: ['Kamusta?'],
      },
      {
        id: 'mabuti-naman',
        fil: 'Mabuti naman, salamat.',
        en: 'I’m doing well, thanks.',
        register: 'neutral',
        note: 'Here, “naman” makes the response sound natural and connected to the question.',
      },
      {
        id: 'magandang-umaga',
        fil: 'Magandang umaga.',
        en: 'Good morning.',
        register: 'neutral',
        note: '“Maganda” becomes “magandang” before the noun “umaga.”',
      },
      {
        id: 'magandang-hapon',
        fil: 'Magandang hapon.',
        en: 'Good afternoon.',
        register: 'neutral',
        note: 'Use this from after noon through late afternoon; once it is evening, say “Magandang gabi.”',
      },
      {
        id: 'salamat-po',
        fil: 'Salamat po.',
        en: 'Thank you.',
        register: 'polite',
        note: '“Po” shows respect. Use it with elders, customers, and people you do not know well.',
      },
      {
        id: 'hindi-naiintindihan',
        fil: 'Hindi ko naiintindihan.',
        en: 'I don’t understand.',
        register: 'neutral',
        note: 'In this construction, “ko” marks the person experiencing understanding; learn the whole sentence as a useful frame.',
        accepted: ['Hindi ko maintindihan.'],
      },
      {
        id: 'pakiulit',
        fil: 'Puwede po bang pakiulit?',
        en: 'Could you please repeat that?',
        register: 'polite',
        note: '“Bang” is the question particle “ba” plus the linker “-ng” here; it connects “puwede” to the requested action. “Ba” does not become “bang” before every following word.',
        accepted: ['Pwede po bang pakiulit?', 'Pakiulit po.'],
      },
    ],
    dialogue: {
      situation: 'A new neighbor greets you.',
      line: 'Kumusta ka?',
      reply: 'Mabuti naman, salamat. Ikaw?',
      alternatives: ['Magkano po lahat?', 'Diretso lang.'],
      note: '“Ikaw?” naturally returns the question: “And you?”',
    },
  },
  {
    id: 'introductions',
    number: 2,
    title: 'Introductions',
    titleFil: 'Ako si…',
    description: 'Share your name, where you are from, and where you live.',
    canDo: 'I can introduce myself and ask basic personal questions.',
    minutes: 11,
    soundFocus:
      'Keep the final vowels audible in ako, kayo, and ninyo. Tap the “r” once in trabaho.',
    pattern: {
      frame: 'Ano po ang [noun] ninyo?',
      transform: 'trabaho → pangalan',
      note: 'Keep the respectful frame and swap the information you want to ask about.',
    },
    phrases: [
      {
        id: 'ako-si',
        fil: 'Ako si Ana.',
        en: 'I’m Ana.',
        register: 'neutral',
        note: 'In the frame “Ako si + name,” use “si” before one person’s name.',
      },
      {
        id: 'pangalan-mo',
        fil: 'Anong pangalan mo?',
        en: 'What’s your name?',
        register: 'casual',
        note: '“Anong” is “ano” plus the linker “-ng” before a noun; compare the full question “Ano ang pangalan mo?”',
      },
      {
        id: 'pangalan-ninyo',
        fil: 'Ano po ang pangalan ninyo?',
        en: 'What is your name?',
        register: 'polite',
        note: '“Ninyo” is the respectful or plural form of “your.”',
      },
      {
        id: 'taga-saan',
        fil: 'Taga-saan ka?',
        en: 'Where are you from?',
        register: 'neutral',
        note: '“Taga-” identifies someone’s place of origin or home area; with “saan,” it asks where someone is from.',
      },
      {
        id: 'taga-california',
        fil: 'Taga-California ako.',
        en: 'I’m from California.',
        register: 'neutral',
        note: 'Replace “California” with your own place.',
      },
      {
        id: 'nakatira',
        fil: 'Nakatira ako sa Los Angeles.',
        en: 'I live in Los Angeles.',
        register: 'neutral',
        note: 'After “nakatira,” use “sa” to introduce the place where someone lives.',
      },
      {
        id: 'trabaho',
        fil: 'Anong trabaho mo?',
        en: 'What do you do for work?',
        register: 'casual',
        note: 'A natural way to ask someone’s occupation in everyday conversation.',
      },
    ],
    dialogue: {
      situation: 'You meet someone at a friend’s party.',
      line: 'Ako si Lea. Ikaw?',
      reply: 'Ako si Marco.',
      alternatives: ['Taga-saan ka?', 'Magandang hapon.'],
      note: 'After “Ako si…,” use a name—not a place or occupation.',
    },
  },
  {
    id: 'needs',
    number: 3,
    title: 'Wants & questions',
    titleFil: 'Gusto ko…',
    description: 'Express wants and needs, then ask simple questions.',
    canDo:
      'I can say what I want or need and ask whether something is available.',
    minutes: 11,
    soundFocus:
      'Say kailangan by syllable first: ka-ʔi-la-ngan. Then connect the syllables at a natural speed.',
    pattern: {
      frame: 'Kailangan ko ng [thing].',
      transform: 'tubig → tulong',
      note: 'Keep “ng” before the thing that is needed.',
    },
    phrases: [
      {
        id: 'gusto-kape',
        fil: 'Gusto ko ng kape.',
        en: 'I want coffee.',
        register: 'neutral',
        note: 'Use “ng” before the thing wanted.',
      },
      {
        id: 'ayoko-maanghang',
        fil: 'Ayoko ng maanghang.',
        en: 'I don’t want anything spicy. / I don’t like spicy food.',
        register: 'neutral',
        note: 'Depending on context, “ayoko” can mean either “I don’t want” or “I don’t like.”',
      },
      {
        id: 'kailangan-tulong',
        fil: 'Kailangan ko ng tulong.',
        en: 'I need help.',
        register: 'neutral',
        note: 'The pattern is “Kailangan ko ng + thing needed.”',
      },
      {
        id: 'mayroon-tubig',
        fil: 'Mayroon po ba kayong tubig?',
        en: 'Do you have water?',
        register: 'polite',
        note: '“Mayroon” is often shortened to “meron” in casual speech.',
        accepted: ['Meron po ba kayong tubig?'],
      },
      {
        id: 'puwede-ba',
        fil: 'Puwede ba ito?',
        en: 'Is this allowed / okay?',
        register: 'neutral',
        note: '“Puwede” covers possibility, permission, and what is acceptable.',
        accepted: ['Pwede ba ito?'],
      },
      {
        id: 'saan-banyo',
        fil: 'Nasaan ang banyo?',
        en: 'Where is the bathroom?',
        register: 'neutral',
        note: '“Nasaan” asks where something is located. Add “po” when speaking respectfully.',
        accepted: [
          'Saan ang banyo?',
          'Nasaan po ang banyo?',
          'Saan po ang banyo?',
        ],
      },
      {
        id: 'sandali-lang',
        fil: 'Sandali lang.',
        en: 'Just a moment.',
        register: 'neutral',
        note: '“Lang” means “only/just” and softens many everyday expressions.',
      },
    ],
    dialogue: {
      situation: 'A friend asks what you would like.',
      line: 'Ano ang gusto mo?',
      reply: 'Gusto ko ng kape.',
      alternatives: ['Nakatira ako rito.', 'Kumaliwa sa kanto.'],
      note: 'Answer “Ano ang gusto mo?” with “Gusto ko ng…”',
    },
  },
  {
    id: 'food',
    number: 4,
    title: 'Food & paying',
    titleFil: 'Isang adobo po.',
    description: 'Order food, make a request, and pay with confidence.',
    canDo: 'I can order a simple meal and ask for the total.',
    minutes: 12,
    soundFocus:
      'Keep every vowel distinct in ma-sa-rap and pa-ki-ba-lot; do not reduce unstressed vowels to an English “uh.”',
    pattern: {
      frame: 'Masarap (ang [food]).',
      transform: 'Masarap! → Masarap ang adobo.',
      note: 'Use “Masarap!” alone as a reaction, or add “ang + food” to name what tastes good.',
    },
    phrases: [
      {
        id: 'isang-adobo',
        fil: 'Isang adobo po.',
        en: 'One serving of adobo, please.',
        register: 'polite',
        note: 'In a restaurant, this means one serving or order. “Isa” takes the linker “-ng” before the item: “isang adobo.”',
      },
      {
        id: 'tubig-lang',
        fil: 'Tubig lang po.',
        en: 'Just water, please.',
        register: 'polite',
        note: '“Lang” limits the request to water.',
      },
      {
        id: 'masarap',
        fil: 'Masarap!',
        en: 'Delicious!',
        register: 'neutral',
        note: 'Use this for food that tastes good.',
      },
      {
        id: 'hindi-masyadong-maanghang',
        fil: 'Huwag po sanang masyadong maanghang.',
        en: 'Please don’t make it too spicy.',
        register: 'polite',
        note: '“Huwag” makes a negative request; “sana” softens it.',
        accepted: ['Huwag masyadong maanghang, please.'],
      },
      {
        id: 'pakibalot',
        fil: 'Pakibalot po.',
        en: 'Please wrap it to go.',
        register: 'polite',
        note: '“Paki-” turns the action into a polite request.',
      },
      {
        id: 'magkano-lahat',
        fil: 'Magkano po lahat?',
        en: 'How much is everything?',
        register: 'polite',
        note: '“Lahat” means “all/everything.”',
      },
      {
        id: 'bayad-po',
        fil: 'Heto po ang bayad.',
        en: 'Here is my payment.',
        register: 'polite',
        note: 'Say this while handing over money. On public transport, “Bayad po” is the conventional fare-passing call.',
      },
    ],
    dialogue: {
      situation: 'A server asks for your order.',
      line: 'Ano pong order ninyo?',
      reply: 'Isang adobo at tubig po.',
      alternatives: ['Mabuti naman, salamat.', 'Naliligaw ako.'],
      note: '“Order” is common service-encounter Taglish; a neutral Filipino alternative is “Ano pong gusto ninyong kainin?” “Po” marks respect, and its position depends on sentence structure.',
    },
  },
  {
    id: 'directions',
    number: 5,
    title: 'Directions & transport',
    titleFil: 'Nasaan po ang…?',
    description: 'Find a place, follow directions, and stop a jeepney.',
    canDo: 'I can ask where something is and understand simple directions.',
    minutes: 12,
    soundFocus:
      'Tap the “r” once in diretso, and pronounce each syllable in ku-MA-nan and ku-ma-li-WAʔ before speeding up.',
    pattern: {
      frame: '[direction verb] sa [place].',
      transform: 'Kumaliwa → Kumanan',
      note: 'Swap the direction verb while keeping the destination phrase.',
    },
    phrases: [
      {
        id: 'saan-istasyon',
        fil: 'Nasaan po ang istasyon?',
        en: 'Where is the station?',
        register: 'polite',
        note: 'Swap “istasyon” for the place you need.',
        accepted: ['Saan po ang istasyon?'],
      },
      {
        id: 'diretso-lang',
        fil: 'Diretso lang.',
        en: 'Just go straight.',
        register: 'neutral',
        note: 'A very common short direction.',
      },
      {
        id: 'kumanan',
        fil: 'Kumanan sa kanto.',
        en: 'Turn right at the corner.',
        register: 'neutral',
        note: '“Kanan” is right; “kumanan” is to turn right.',
      },
      {
        id: 'kumaliwa',
        fil: 'Kumaliwa sa susunod na kanto.',
        en: 'Turn left at the next corner.',
        register: 'neutral',
        note: '“Kaliwa” is left; “kumaliwa” is to turn left.',
      },
      {
        id: 'anong-oras',
        fil: 'Anong oras na?',
        en: 'What time is it?',
        register: 'neutral',
        note: '“Na” is conventional in this current-time question; elsewhere it can signal “already,” “now,” or a change of state.',
      },
      {
        id: 'para-po',
        fil: 'Para po!',
        en: 'Please stop here!',
        register: 'polite',
        note: 'Say this to ask a jeepney or bus driver to let you off.',
      },
      {
        id: 'malayo-ba',
        fil: 'Malayo ba?',
        en: 'Is it far?',
        register: 'neutral',
        note: '“Ba” turns the statement “Malayo” into a yes/no question.',
      },
    ],
    dialogue: {
      situation: 'You ask how to reach the station.',
      line: 'Paano po pumunta sa istasyon?',
      reply: 'Diretso lang, tapos kumaliwa.',
      alternatives: ['Tubig lang po.', 'Ako si Marco.'],
      note: '“Tapos” means “then/after that” in conversational directions.',
    },
  },
  {
    id: 'routine',
    number: 6,
    title: 'Family & daily life',
    titleFil: 'Araw-araw',
    description: 'Talk about family, home, work, and your routine.',
    canDo: 'I can describe a few people and actions in my daily routine.',
    minutes: 12,
    soundFocus:
      'Break long verbs into syllables before natural-speed practice: gu-mi-gi-sing, nag-ta-tra-ba-ho, u-mu-u-wi.',
    pattern: {
      frame: '[verb] ako nang [time].',
      transform: 'alas-singko → alas-siyete',
      note: 'Use “nang” to connect an action with the time it happens.',
    },
    phrases: [
      {
        id: 'nanay-ko',
        fil: 'Ito ang nanay ko.',
        en: 'This is my mother.',
        register: 'neutral',
        note: '“Ko” means “my” here and follows the noun.',
      },
      {
        id: 'may-kapatid',
        fil: 'May kapatid ka ba?',
        en: 'Do you have any siblings?',
        register: 'neutral',
        note: 'Tagalog does not require singular or plural here; context supplies it.',
      },
      {
        id: 'gumigising',
        fil: 'Gumigising ako nang alas-siyete.',
        en: 'I wake up at seven.',
        register: 'neutral',
        note: 'Use “nang” to connect the action with the time it happens.',
      },
      {
        id: 'kumakain-almusal',
        fil: 'Kumakain ako ng almusal.',
        en: 'I eat breakfast.',
        register: 'neutral',
        note: 'The repeated syllable in “kumakain” helps mark an ongoing or habitual action.',
      },
      {
        id: 'nagtatrabaho',
        fil: 'Nagtatrabaho ako sa bahay.',
        en: 'I work at home.',
        register: 'neutral',
        note: '“Sa bahay” locates the action at home.',
      },
      {
        id: 'umuuwi',
        fil: 'Umuuwi ako nang alas-singko.',
        en: 'I go home at five.',
        register: 'neutral',
        note: 'Use “nang” before the time that describes when the action happens.',
      },
      {
        id: 'naglalakad',
        fil: 'Araw-araw akong naglalakad.',
        en: 'I walk every day.',
        register: 'neutral',
        note: 'Here, “-ng” is a linker in the fronted-time pattern “Araw-araw akong…”; “ako” does not generally become “akong” merely because a verb follows.',
      },
    ],
    dialogue: {
      situation: 'A friend asks about your morning.',
      line: 'Anong oras ka gumigising?',
      reply: 'Gumigising ako nang alas-siyete.',
      alternatives: ['Para po!', 'Salamat po.'],
      note: 'Use “nang” before the time that describes when an action happens.',
    },
  },
  {
    id: 'plans',
    number: 7,
    title: 'Invitations & plans',
    titleFil: 'Tara!',
    description: 'Invite someone, make plans, accept, or decline kindly.',
    canDo: 'I can make a simple plan and respond to an invitation.',
    minutes: 11,
    soundFocus:
      'Say “Gusto mo bang kumain?” as one continuous phrase. End “bang” with the single “ng” sound heard in “singer”; do not add a separate “g” sound.',
    pattern: {
      frame: 'Kailan tayo [verb]?',
      transform: 'aalis → magkikita',
      note: 'Use “tayo” when “we” includes the person you are speaking with.',
    },
    phrases: [
      {
        id: 'tara',
        fil: 'Tara!',
        en: 'Let’s go!',
        register: 'casual',
        note: 'A warm, common invitation to do something together.',
      },
      {
        id: 'gusto-kumain',
        fil: 'Gusto mo bang kumain?',
        en: 'Do you want to eat?',
        register: 'neutral',
        note: 'Here, “bang” combines the yes/no particle “ba” with the linker “-ng” before the action “kumain.”',
      },
      {
        id: 'kailan-magkikita',
        fil: 'Kailan tayo magkikita?',
        en: 'When will we meet?',
        register: 'neutral',
        note: '“Tayo” includes both the speaker and listener: “we.”',
      },
      {
        id: 'sige-puwede',
        fil: 'Sige, puwede ako.',
        en: 'Okay, I can make it.',
        register: 'neutral',
        note: '“Sige” signals agreement; “puwede ako” says you can make it.',
      },
      {
        id: 'pasensya-hindi-puwede',
        fil: 'Pasensiya na, hindi ako puwede.',
        en: 'Sorry, I can’t.',
        register: 'neutral',
        note: 'A courteous way to decline without sounding abrupt.',
        accepted: [
          'Pasensya na, hindi ako puwede.',
          'Pasensiya na, hindi ako pwede.',
          'Pasensya na, hindi ako pwede.',
        ],
      },
      {
        id: 'mamaya-lang',
        fil: 'Mamaya na lang.',
        en: 'Let’s do it later instead.',
        register: 'neutral',
        note: '“Na lang” often means settling on an alternative.',
      },
      {
        id: 'kita-bukas',
        fil: 'Kita tayo bukas.',
        en: 'See you tomorrow.',
        register: 'casual',
        note: '“Kita tayo” is a casual shortening of “Magkita tayo.” Here “búkas” means “tomorrow”; “bukás” means “open.”',
        accepted: ['Magkita tayo bukas.'],
      },
    ],
    dialogue: {
      situation: 'A friend asks if you are free later.',
      line: 'Libre ka ba mamaya?',
      reply: 'Oo, kita tayo mamaya.',
      alternatives: ['Saan po ang istasyon?', 'Masarap!'],
      note: '“Libre” is a natural borrowed word meaning free or available in this context.',
    },
  },
  {
    id: 'help',
    number: 8,
    title: 'Help & emergencies',
    titleFil: 'Kailangan ko ng tulong.',
    description: 'Ask for urgent help and explain a basic problem.',
    canDo: 'I can ask for help and describe a basic health or safety need.',
    minutes: 11,
    soundFocus:
      'Keep every syllable audible in dok-tor, os-pi-tal, and na-li-li-gaw so these key words stay easy to understand.',
    pattern: {
      frame: 'Masakit ang [body part] ko.',
      transform: 'tiyan → ulo',
      note: 'Name the body part after “ang,” then use “ko” for “my.”',
    },
    phrases: [
      {
        id: 'tulong',
        fil: 'Tulong!',
        en: 'Help!',
        register: 'neutral',
        note: 'Use this as an urgent call for help.',
      },
      {
        id: 'doktor',
        fil: 'Kailangan ko ng doktor.',
        en: 'I need a doctor.',
        register: 'neutral',
        note: 'Use “ng” before the person or thing needed.',
      },
      {
        id: 'masakit-ulo',
        fil: 'Masakit ang ulo ko.',
        en: 'My head hurts.',
        register: 'neutral',
        note: 'The body part takes “ang”; the owner follows with “ko.”',
      },
      {
        id: 'ospital',
        fil: 'Nasaan ang pinakamalapit na ospital?',
        en: 'Where is the nearest hospital?',
        register: 'neutral',
        note: '“Pinakamalapit” means “nearest/closest.”',
      },
      {
        id: 'nawawala',
        fil: 'Naliligaw ako.',
        en: 'I’m lost / I can’t find my way.',
        register: 'neutral',
        note: '“Naliligaw” specifically means losing one’s way; “nawawala” can also mean missing or disappearing.',
        accepted: ['Nawawala ako.'],
      },
      {
        id: 'tumawag-pulis',
        fil: 'Puwede po ba kayong tumawag ng pulis?',
        en: 'Could you call the police?',
        register: 'polite',
        note: '“Kayo” becomes “kayong” before the verb it links to.',
        accepted: ['Pwede po ba kayong tumawag ng pulis?'],
      },
      {
        id: 'emergency',
        fil: 'May emergency po.',
        en: 'There’s an emergency.',
        register: 'Taglish',
        note: '“Emergency” is widely used in contemporary speech; “po” keeps the message respectful.',
      },
    ],
    dialogue: {
      situation: 'Someone asks what happened.',
      line: 'Ano ang nangyari?',
      reply: 'Naliligaw ako at kailangan ko ng tulong.',
      alternatives: ['Isang adobo po.', 'Kita tayo bukas.'],
      note: 'Join two related ideas with “at,” meaning “and.”',
    },
  },
];

export function getUnit(unitId: string) {
  return units.find((unit) => unit.id === unitId) ?? units[0];
}

export function nextUnitAfter(unitId: string) {
  const index = units.findIndex((unit) => unit.id === unitId);
  return units[Math.min(units.length - 1, Math.max(0, index + 1))];
}
