export type FoundationExample = {
  fil: string;
  en: string;
};

export type ChoiceDrill = {
  question: string;
  options: string[];
  correct: string;
  note: string;
};

export type FoundationUnit = {
  pronunciation: {
    title: string;
    explanation: string;
    model: string;
    syllables: string;
    coach: string;
    drill: ChoiceDrill;
  };
  grammar: {
    title: string;
    explanation: string;
    formula: string;
    examples: FoundationExample[];
    drill: ChoiceDrill;
  };
  reading: {
    title: string;
    passage: string;
    translation: string;
    drill: ChoiceDrill;
  };
};

export const foundations: Record<string, FoundationUnit> = {
  greetings: {
    pronunciation: {
      title: 'Five clear vowels + one “ng” sound',
      explanation:
        'Tagalog vowels stay relatively steady: a, e, i, o, u. Avoid turning an unstressed vowel into the English “uh.” Within a word, “ng” represents one consonant sound, like the end of “sing,” and that sound can also begin a Tagalog word.',
      model: 'Kumusta? Magandang umaga.',
      syllables: 'ku-mus-TA · ma-gan-DANG u-MA-ga',
      coach:
        'Tap the full model, copy it slowly by syllable, then say it once at a natural pace. Keep the final a audible.',
      drill: {
        question: 'Which guide is the best starting point for “Kumusta?”',
        options: [
          'ku-mus-TA — three clear syllables',
          'kyuh-MUSS-tuh — reduce both vowels',
          'ku-MUS — drop the final vowel',
        ],
        correct: 'ku-mus-TA — three clear syllables',
        note: '“Kumusta?” has three audible syllables, with the main stress at the end in the common standard pronunciation.',
      },
    },
    grammar: {
      title: 'Start with the message',
      explanation:
        'Everyday Tagalog often puts the description or new information first, then the person or topic. “Po” adds respect without changing that basic structure.',
      formula: 'description or message + (po) + person/topic',
      examples: [
        { fil: 'Mabuti ako.', en: 'I am well.' },
        { fil: 'Mabuti po ako.', en: 'I am well. (polite)' },
      ],
      drill: {
        question: 'Choose the natural polite sentence for “I am well.”',
        options: ['Mabuti po ako.', 'Po ako mabuti.', 'Ako po mabuti.'],
        correct: 'Mabuti po ako.',
        note: '“Mabuti” carries the message, “po” adds respect, and “ako” identifies the speaker.',
      },
    },
    reading: {
      title: 'A greeting with a repair request',
      passage:
        'A: Kumusta po? B: Mabuti naman, salamat. A: Puwede po bang pakiulit?',
      translation:
        'A: How are you? B: I’m doing well, thanks. A: Could you please repeat that?',
      drill: {
        question: 'What does speaker A ask for at the end?',
        options: ['A repetition', 'The bill', 'A direction'],
        correct: 'A repetition',
        note: '“Pakiulit” is a useful repair request when you did not catch what was said.',
      },
    },
  },
  introductions: {
    pronunciation: {
      title: 'Keep adjacent vowels separate',
      explanation:
        'When two vowels meet, do not automatically blend them into an English-style glide. In “saan,” say sa-ʔAN: keep the two a vowels separate with the small throat catch heard between the parts of “uh-oh.” Final vowels in words such as “ako” and “kayo” also stay audible.',
      model: 'Taga-saan ka? Ako si Ana.',
      syllables: 'ta-ga-sa-ʔAN ka · a-KO si A-na',
      coach:
        'Say “sa-ʔan” slowly, then shorten the gap without losing either vowel. Keep the last o in “ako” full and clear.',
      drill: {
        question: 'How should you begin practicing “saan”?',
        options: [
          'sa-ʔAN — two vowels with a small throat catch',
          'san — one short English vowel',
          'say-an — add an English y sound',
        ],
        correct: 'sa-ʔAN — two vowels with a small throat catch',
        note: 'The two a vowels are separated by a glottal stop, the small throat catch also heard in “uh-oh.”',
      },
    },
    grammar: {
      title: 'Identify people with “si”',
      explanation:
        'In this identification frame, use “si” before one personal name; “ang” is the corresponding marker for a common-noun phrase. A very common introduction is “Ako si + name.” Tagalog does not need a separate word for “am” in this sentence.',
      formula: 'Ako si + personal name',
      examples: [
        { fil: 'Ako si Ana.', en: 'I’m Ana.' },
        { fil: 'Ana ang pangalan ko.', en: 'My name is Ana.' },
      ],
      drill: {
        question: 'Complete the introduction: “Ako ___ Liza.”',
        options: ['si', 'ang', 'ng'],
        correct: 'si',
        note: '“Si” marks the personal name Liza in this identification sentence.',
      },
    },
    reading: {
      title: 'Name, origin, and home',
      passage:
        'Ako si Maya. Taga-California ako, pero nakatira ako sa Maynila.',
      translation: 'I’m Maya. I’m from California, but I live in Manila.',
      drill: {
        question: 'Where does Maya live now?',
        options: ['Sa Maynila', 'Sa California', 'Hindi sinabi'],
        correct: 'Sa Maynila',
        note: '“Taga-” gives origin; “nakatira … sa” gives the place where someone lives.',
      },
    },
  },
  needs: {
    pronunciation: {
      title: 'Syllable timing in “kailangan” and “ng”',
      explanation:
        'Longer words become easier when you preserve each syllable. The standalone written marker “ng” is pronounced like “nang”; inside “kailangan,” the same ng spelling represents one consonant sound.',
      model: 'Kailangan ko ng tubig.',
      syllables: 'ka-ʔi-LA-ngan ko nang TU-big',
      coach:
        'Practice “ka-ʔi-la-ngan” slowly. Then connect it without deleting the i or turning ng into separate n and g sounds.',
      drill: {
        question: 'How is the standalone marker “ng” spoken here?',
        options: [
          'Like “nang”',
          'As separate letters n-g',
          'Like English “ing”',
        ],
        correct: 'Like “nang”',
        note: 'Keep writing “ng,” but pronounce the standalone grammatical marker like “nang.”',
      },
    },
    grammar: {
      title: 'Existence and possession with “may”',
      explanation:
        '“May + noun” says that something exists or that someone has it. Add “ba” to make a neutral yes/no question. “May” normally comes directly before its noun phrase. “Mayroon” can stand alone, or be followed by a pronoun plus linker: “Mayroon akong tubig” / “Mayroon ba kayong tubig?”',
      formula: 'May + thing + (person) + (ba?)',
      examples: [
        { fil: 'May tubig.', en: 'There is water.' },
        { fil: 'May tubig ka ba?', en: 'Do you have water?' },
      ],
      drill: {
        question: 'Ask a friend, “Do you have coffee?”',
        options: ['May kape ka ba?', 'May ba kape ka?', 'Kape may ka ba?'],
        correct: 'May kape ka ba?',
        note: 'Place the thing after “may,” then the person, with “ba” marking the yes/no question.',
      },
    },
    reading: {
      title: 'At a small store',
      passage:
        'A: Mayroon po ba kayong tubig? B: Opo. Malamig po o hindi? A: Malamig po.',
      translation:
        'A: Do you have water? B: Yes. Would you like it cold or not? A: Cold, please.',
      drill: {
        question: 'What kind of water does the customer choose?',
        options: ['Cold water', 'Hot water', 'No water'],
        correct: 'Cold water',
        note: '“Malamig” means cold; the last answer keeps the request brief and polite.',
      },
    },
  },
  food: {
    pronunciation: {
      title: 'Hear the linker even when it attaches',
      explanation:
        'A linker joins words that belong together. After a vowel, it is often written as attached “-ng”: isa + -ng becomes “isang.” After most consonants, the separate linker is “na,” as in “masarap na pagkain.”',
      model: 'Isang adobo po. Masarap na pagkain.',
      syllables: 'i-SANG a-DO-bo po · ma-sa-RAP na pag-KA-ʔin',
      coach:
        'Let the final ng in “isang” flow directly into the next word, but do not add a separate hard g release.',
      drill: {
        question: 'Which phrase correctly joins “masarap” and “pagkain”?',
        options: [
          'masarap na pagkain',
          'masarap-ng pagkain',
          'masarap ang na pagkain',
        ],
        correct: 'masarap na pagkain',
        note: 'Because “masarap” ends in a consonant, the linker is the separate word “na.”',
      },
    },
    grammar: {
      title: 'Contrast “ang” and “ng” in useful frames',
      explanation:
        'In these two frames, “ang” marks the food being described, while “ng” marks the thing wanted. These markers do not have one fixed English translation, so learn them inside complete frames.',
      formula: 'Masarap ang X. · Gusto ko ng X.',
      examples: [
        { fil: 'Masarap ang adobo.', en: 'The adobo is delicious.' },
        { fil: 'Gusto ko ng adobo.', en: 'I want adobo.' },
      ],
      drill: {
        question: 'Complete “I want adobo”: “Gusto ko ___ adobo.”',
        options: ['ng', 'ang', 'sa'],
        correct: 'ng',
        note: 'The wanted item follows “ng” in the common frame “Gusto ko ng …”',
      },
    },
    reading: {
      title: 'Ordering and paying',
      passage:
        'Server: Ano pong order ninyo? Customer: Isang adobo at tubig po. Pakibalot din po. Magkano po lahat?',
      translation:
        'Server: What is your order? Customer: One adobo and water, please. Please wrap it to go too. How much is everything?',
      drill: {
        question: 'What extra request does the customer make?',
        options: ['Wrap it to go', 'Make it spicy', 'Bring coffee'],
        correct: 'Wrap it to go',
        note: '“Pakibalot” asks someone to wrap the food; “din” means also in this sentence.',
      },
    },
  },
  directions: {
    pronunciation: {
      title: 'A light tap for “r”',
      explanation:
        'A Filipino r is commonly a brief tongue tap, not the sustained American English r. Keep the vowels around it clear, and keep p, t, and k crisp rather than strongly puffed with air.',
      model: 'Diretso lang, tapos kumaliwa.',
      syllables: 'di-RET-so lang · TA-pos ku-ma-li-WAʔ',
      coach:
        'Touch the tongue quickly near the ridge behind your upper teeth for r, then move straight into the next vowel.',
      drill: {
        question: 'What is the best target for the r in “diretso”?',
        options: [
          'One quick tongue tap',
          'A long American r',
          'A silent letter',
        ],
        correct: 'One quick tongue tap',
        note: 'A quick tap is a practical beginner target and keeps “diretso” easy to understand.',
      },
    },
    grammar: {
      title: 'Location with “sa” and demonstratives',
      explanation:
        '“Sa” marks many locations and destinations. For things, “ito” points near the speaker, “iyan” near the listener, and “iyon” away from both. “Nasaan” asks where a person or thing is located.',
      formula: 'Nasaan ang X? · Pumunta sa X. · ito / iyan / iyon',
      examples: [
        { fil: 'Nasaan ang istasyon?', en: 'Where is the station?' },
        { fil: 'Pumunta sa istasyon.', en: 'Go to the station.' },
      ],
      drill: {
        question:
          'Point to a map that the listener is holding: “___ ang mapa.”',
        options: ['Iyan', 'Ito', 'Iyon'],
        correct: 'Iyan',
        note: '“Iyan” normally points to something near the listener. Real conversations can also use gesture and shared viewpoint.',
      },
    },
    reading: {
      title: 'Follow two steps',
      passage:
        'A: Nasaan po ang istasyon? B: Diretso lang. Kumanan sa unang kanto, tapos kumaliwa sa bangko.',
      translation:
        'A: Where is the station? B: Just go straight. Turn right at the first corner, then turn left at the bank.',
      drill: {
        question: 'What should the traveler do first after going straight?',
        options: ['Turn right', 'Turn left', 'Stop at the bank'],
        correct: 'Turn right',
        note: '“Kumanan” is turn right; “tapos” introduces the next step.',
      },
    },
  },
  routine: {
    pronunciation: {
      title: 'Hear repeated syllables',
      explanation:
        'Tagalog verb forms often repeat part of the root. Say every repeated syllable: “kumakain,” not a shortened English-style version. This repetition helps signal an ongoing or habitual action.',
      model: 'Araw-araw akong naglalakad.',
      syllables: 'A-raw-A-raw a-KONG nag-LA-la-KAD',
      coach:
        'Clap the syllables slowly, then keep the same sequence while making the phrase smoother and faster.',
      drill: {
        question: 'Which practice keeps the repeated material audible?',
        options: ['nag-la-la-kad', 'nag-lakad', 'nag-yakad'],
        correct: 'nag-la-la-kad',
        note: 'The repeated “la” is part of the ongoing or habitual form “naglalakad.”',
      },
    },
    grammar: {
      title: 'Tagalog verbs show aspect',
      explanation:
        'Tagalog verb forms foreground whether an action is completed, begun but not completed (including ongoing or habitual uses), or not yet begun (contemplated). This is called aspect. With many actor-voice (also called actor-focus) “-um-” verbs, “kumain” is completed in context, “kumakain” is ongoing or habitual, and “kakain” is contemplated or planned.',
      formula: 'kumain · kumakain · kakain',
      examples: [
        { fil: 'Kumain ako.', en: 'I ate.' },
        { fil: 'Kumakain ako.', en: 'I am eating / I eat habitually.' },
        { fil: 'Kakain ako.', en: 'I will eat / I plan to eat.' },
      ],
      drill: {
        question:
          'Choose the form for a daily habit: “___ ako ng almusal araw-araw.”',
        options: ['Kumakain', 'Kumain', 'Kakain'],
        correct: 'Kumakain',
        note: 'The repetition in “kumakain” marks the action as ongoing or habitual here.',
      },
    },
    reading: {
      title: 'A short morning routine',
      passage:
        'Gumigising ako nang alas-siyete. Kumakain ako ng almusal. Pagkatapos, nagtatrabaho ako sa bahay.',
      translation:
        'I wake up at seven. I eat breakfast. Afterward, I work at home.',
      drill: {
        question: 'What happens after breakfast?',
        options: [
          'The speaker works at home',
          'The speaker goes to the station',
          'The speaker goes back to sleep',
        ],
        correct: 'The speaker works at home',
        note: '“Pagkatapos” marks what happens afterward; “sa bahay” gives the location.',
      },
    },
  },
  plans: {
    pronunciation: {
      title: 'Stress can distinguish words',
      explanation:
        'Stress is meaningful in Tagalog. Teaching materials may add accent marks to show it, although ordinary spelling usually omits them. “Búkas” means tomorrow, while “bukás” means open.',
      model: 'Kita tayo bukas.',
      syllables: 'KI-ta TA-yo BU-kas (tomorrow)',
      coach:
        'Make the first vowel of “bukas” slightly longer and prominent in this sentence. Copy the full model so context reinforces the meaning.',
      drill: {
        question: 'Which pronunciation guide means “tomorrow”?',
        options: ['BU-kas', 'bu-KAS', 'bu-ka-S'],
        correct: 'BU-kas',
        note: 'Initial stress gives “búkas,” tomorrow. Final stress gives “bukás,” open.',
      },
    },
    grammar: {
      title: 'Two kinds of “we”',
      explanation:
        'Use “tayo” when the listener is included. Use “kami” when the listener is not included. This distinction matters whenever you make plans or talk about a group.',
      formula: 'tayo = you + me/us · kami = we, not you',
      examples: [
        {
          fil: 'Kailan tayo magkikita?',
          en: 'When will we meet? (you included)',
        },
        {
          fil: 'Aalis kami bukas.',
          en: 'We will leave tomorrow. (you excluded)',
        },
      ],
      drill: {
        question: 'Invite the person you are speaking to: “Kakain ___ mamaya.”',
        options: ['tayo', 'kami', 'ako'],
        correct: 'tayo',
        note: 'The listener is part of the plan, so the inclusive pronoun “tayo” is required.',
      },
    },
    reading: {
      title: 'Make and adjust a plan',
      passage:
        'A: Libre ka ba mamaya? B: Pasensiya na, hindi ako puwede. Bukas na lang? A: Sige, kita tayo bukas.',
      translation:
        'A: Are you free later? B: Sorry, I can’t. Tomorrow instead? A: Okay, see you tomorrow.',
      drill: {
        question: 'When will they meet?',
        options: ['Tomorrow', 'Later today', 'They cancel completely'],
        correct: 'Tomorrow',
        note: '“Bukas na lang” proposes tomorrow as the alternative, and the final line accepts it.',
      },
    },
  },
  help: {
    pronunciation: {
      title: 'Clear syllables under pressure',
      explanation:
        'In urgent phrases, clarity matters more than speed. Start vowel-initial words such as “ospital” cleanly without adding an English y or w sound, and avoid reducing the middle vowels.',
      model: 'Ospital po. Kailangan ko ng doktor.',
      syllables: 'os-pi-TAL po · ka-ʔi-LA-ngan ko nang dok-TOR',
      coach:
        'Take one short breath per phrase. Make the stressed syllable clear, but keep every other vowel audible too.',
      drill: {
        question: 'Which is the clearest practice breakdown for “ospital”?',
        options: ['os-pi-TAL', 'wos-PTAL', 'os-puhl'],
        correct: 'os-pi-TAL',
        note: 'Three clear syllables keep this high-value emergency word recognizable.',
      },
    },
    grammar: {
      title: 'Describe a physical state',
      explanation:
        'Many state words begin with “ma-.” In the useful health frame “Masakit ang X ko,” the body part is marked by “ang,” and the possessor follows it: “ko” for my, “mo” for your.',
      formula: 'Masakit ang + body part + ko/mo.',
      examples: [
        { fil: 'Masakit ang ulo ko.', en: 'My head hurts.' },
        { fil: 'Masakit ba ang tiyan mo?', en: 'Does your stomach hurt?' },
      ],
      drill: {
        question: 'Say “My stomach hurts.”',
        options: [
          'Masakit ang tiyan ko.',
          'Masakit ko ang tiyan.',
          'Ang ko tiyan masakit.',
        ],
        correct: 'Masakit ang tiyan ko.',
        note: 'Keep the frame “Masakit ang + body part + ko.”',
      },
    },
    reading: {
      title: 'Ask for urgent help',
      passage:
        'A: Ano ang nangyari? B: Masakit ang tiyan ko. Kailangan ko ng doktor. Nasaan ang pinakamalapit na ospital?',
      translation:
        'A: What happened? B: My stomach hurts. I need a doctor. Where is the nearest hospital?',
      drill: {
        question: 'What does speaker B need?',
        options: ['A doctor', 'A restaurant', 'A bus ticket'],
        correct: 'A doctor',
        note: '“Kailangan ko ng doktor” states the urgent need directly.',
      },
    },
  },
};

export function getFoundation(unitId: string): FoundationUnit {
  return foundations[unitId] ?? foundations.greetings;
}
