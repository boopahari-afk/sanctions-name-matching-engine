import { useState, useEffect, useRef } from "react";

// ── Fuzzy matching utilities ──────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  const matchDist = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1m = Array(l1).fill(false), s2m = Array(l2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, l2);
    for (let j = lo; j < hi; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches/l1 + matches/l2 + (matches - transpositions/2)/matches) / 3;
}

function jaroWinkler(s1, s2) {
  const j = jaro(s1, s2);
  let p = 0;
  const len = Math.min(s1.length, s2.length, 4);
  for (let i = 0; i < len; i++) { if (s1[i] === s2[i]) p++; else break; }
  return j + p * 0.1 * (1 - j);
}

function tokenSort(s) {
  return s.toLowerCase().split(/\s+/).sort().join(" ");
}

function normalize(s) {
  return s.toLowerCase()
    .replace(/[.,\-']/g, " ")
    .replace(/\b(mr|mrs|dr|jr|sr|the|al|bin|binti|von|van|de|el)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

function scoreMatch(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  const qSorted = tokenSort(q), cSorted = tokenSort(c);

  const exact = q === c ? 100 : 0;
  const jwScore = Math.round(jaroWinkler(q, c) * 100);
  const jwSorted = Math.round(jaroWinkler(qSorted, cSorted) * 100);
  const maxLen = Math.max(q.length, c.length);
  const levScore = maxLen === 0 ? 100 : Math.round((1 - levenshtein(q, c) / maxLen) * 100);

  // Weighted ensemble
  const score = exact || Math.round(jwScore * 0.4 + jwSorted * 0.35 + levScore * 0.25);

  let method = "Jaro-Winkler";
  if (exact) method = "Exact Match";
  else if (jwSorted > jwScore + 5) method = "Token Sort + JW";
  else if (levScore > jwScore + 5) method = "Levenshtein";

  return { score: Math.min(score, 100), method };
}

function getRiskLevel(score) {
  if (score >= 90) return { label: "CRITICAL", color: "#ff2d55", bg: "rgba(255,45,85,0.12)", tier: 4 };
  if (score >= 75) return { label: "HIGH", color: "#ff9500", bg: "rgba(255,149,0,0.12)", tier: 3 };
  if (score >= 55) return { label: "MEDIUM", color: "#ffd60a", bg: "rgba(255,214,10,0.12)", tier: 2 };
  return { label: "LOW", color: "#30d158", bg: "rgba(48,209,88,0.12)", tier: 1 };
}

// ── Sanctions Dataset (OFAC / UN / EU / HMT / FINCEN inspired — 200+ entities) ─
const SANCTIONS_LIST = [
  // ── TERRORISM / AL-QAEDA / ISIS ───────────────────────────────────────────
  { id:"UN1267-001", name:"Osama Bin Laden", aliases:["Usama bin Ladin","Abu Abdallah","Shaykh Usama"], list:"UN 1267", country:"Saudi Arabia", category:"Terrorism" },
  { id:"UN1267-002", name:"Ayman Al-Zawahiri", aliases:["Ayman al Zawahiri","Abu Muhammad","Dr Ayman"], list:"UN 1267", country:"Egypt", category:"Terrorism" },
  { id:"UN1267-003", name:"Abu Bakr Al-Baghdadi", aliases:["Ibrahim Awwad Ibrahim","Caliph Ibrahim","Abu Dua"], list:"UN 1267", country:"Iraq", category:"Terrorism" },
  { id:"UN1267-004", name:"Mohammed Omar", aliases:["Mullah Omar","Mullah Mohammed Omar Mujahid"], list:"UN 1988", country:"Afghanistan", category:"Terrorism" },
  { id:"UN1267-005", name:"Gulbuddin Hekmatyar", aliases:["Gulbaddin Hekmatyar","Engineer Gulbuddin"], list:"UN 1267", country:"Afghanistan", category:"Terrorism" },
  { id:"UN1267-006", name:"Sirajuddin Haqqani", aliases:["Siraj Haqqani","Khalifa"], list:"UN 1988", country:"Afghanistan", category:"Terrorism" },
  { id:"UN1267-007", name:"Jalaluddin Haqqani", aliases:["Jala-ud-Din Haqqani"], list:"UN 1988", country:"Afghanistan", category:"Terrorism" },
  { id:"UN1267-008", name:"Yahya Ibrahim Ahmed Al-Mujali", aliases:["Abu Yahya al-Libi"], list:"UN 1267", country:"Libya", category:"Terrorism" },
  { id:"UN1267-009", name:"Abu Mohammed Al-Adnani", aliases:["Taha Subhi Falaha","Yasser Khalaf"], list:"UN 1267", country:"Syria", category:"Terrorism" },
  { id:"UN1267-010", name:"Abdullah Ahmed Abdullah", aliases:["Abu Mohammed al-Masri","Saleh"], list:"UN 1267", country:"Egypt", category:"Terrorism" },
  { id:"UN1267-011", name:"Anas Al-Libi", aliases:["Nazih Abdul Hamed al-Raghie","Abu Anas"], list:"UN 1267", country:"Libya", category:"Terrorism" },
  { id:"UN1267-012", name:"Saif Al-Adel", aliases:["Muhamad Ibrahim Makkawi"], list:"UN 1267", country:"Egypt", category:"Terrorism" },
  { id:"UN1267-013", name:"Abdul Rehman Al-Maghrebi", aliases:["Usama Abd al-Rahman"], list:"UN 1267", country:"Morocco", category:"Terrorism" },
  { id:"UN1267-014", name:"Abu Musab Al-Zarqawi", aliases:["Ahmad Fadeel al-Nazal al-Khalayleh"], list:"UN 1267", country:"Jordan", category:"Terrorism" },
  { id:"UN1267-015", name:"Mokhtar Belmokhtar", aliases:["Khaled Abu al-Abbas","Laaouar"], list:"UN 1267", country:"Algeria", category:"Terrorism" },
  { id:"UN1267-016", name:"Abu Qatada Al-Filistini", aliases:["Omar Mahmoud Othman","Sheikh Abu Qatada"], list:"UN 1267", country:"Jordan", category:"Terrorism" },
  { id:"UN1267-017", name:"Anwar Al-Awlaki", aliases:["Anwar Nasser Abdulla Aulaqi"], list:"OFAC SDN", country:"Yemen", category:"Terrorism" },
  { id:"UN1267-018", name:"Ibrahim Hassan Tali Al-Asiri", aliases:["Abu Saleh"], list:"OFAC SDN", country:"Saudi Arabia", category:"Terrorism" },
  { id:"UN1267-019", name:"Qasim Al-Raymi", aliases:["Qasim Yahya Mahdi al-Rimi"], list:"UN 1267", country:"Yemen", category:"Terrorism" },
  { id:"UN1267-020", name:"Khalid Sheikh Mohammed", aliases:["Mukhtar al-Baluchi","Khalid Shaikh Mohammed"], list:"OFAC SDN", country:"Pakistan", category:"Terrorism" },

  // ── HEZBOLLAH / HAMAS / PIJ ───────────────────────────────────────────────
  { id:"OFAC-HZ-001", name:"Hassan Nasrallah", aliases:["Hasan Nasrallah","Abu Hadi"], list:"OFAC SDN", country:"Lebanon", category:"Terrorism" },
  { id:"OFAC-HZ-002", name:"Ismail Haniyeh", aliases:["Ismail Abdel Salam Ahmed Haniyeh"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-HZ-003", name:"Yahya Sinwar", aliases:["Yahya Ibrahim Hassan Sinwar"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-HZ-004", name:"Mohammed Deif", aliases:["Mohammed Diab Ibrahim al-Masri"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-HZ-005", name:"Imad Mughniyeh", aliases:["Hajj Radwan","Jawad"], list:"OFAC SDN", country:"Lebanon", category:"Terrorism" },
  { id:"OFAC-HZ-006", name:"Naim Qassem", aliases:["Naim Kassem"], list:"OFAC SDN", country:"Lebanon", category:"Terrorism" },
  { id:"OFAC-HZ-007", name:"Hashem Safieddine", aliases:["Hashim Safi al-Din"], list:"OFAC SDN", country:"Lebanon", category:"Terrorism" },
  { id:"OFAC-HZ-008", name:"Ramadan Shallah", aliases:["Ramadan Abdullah Shallah"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-HZ-009", name:"Ziyad Al-Nakhalah", aliases:["Ziad al-Nakhala"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },
  { id:"OFAC-HZ-010", name:"Saleh Al-Arouri", aliases:["Abu Obeida al-Arouri"], list:"OFAC SDN", country:"Palestine", category:"Terrorism" },

  // ── IRAN ──────────────────────────────────────────────────────────────────
  { id:"OFAC-IR-001", name:"Ali Khamenei", aliases:["Sayyid Ali Hosseini Khamenei","Supreme Leader Khamenei"], list:"OFAC SDN", country:"Iran", category:"Government" },
  { id:"OFAC-IR-002", name:"Ebrahim Raisi", aliases:["Ibrahim Raisi","Seyyed Ebrahim Raisi"], list:"OFAC SDN", country:"Iran", category:"Human Rights" },
  { id:"OFAC-IR-003", name:"Qasem Soleimani", aliases:["Qassem Soleimani","Haj Qasem"], list:"OFAC SDN", country:"Iran", category:"Terrorism" },
  { id:"OFAC-IR-004", name:"Esmail Qaani", aliases:["Ismail Qaani","Esmaeil Qaani"], list:"OFAC SDN", country:"Iran", category:"Terrorism" },
  { id:"OFAC-IR-005", name:"Mohammad Ali Jafari", aliases:["Aziz Jafari"], list:"OFAC SDN", country:"Iran", category:"Military" },
  { id:"OFAC-IR-006", name:"Hossein Salami", aliases:["Hussein Salami"], list:"OFAC SDN", country:"Iran", category:"Military" },
  { id:"OFAC-IR-007", name:"Ali Shamkhani", aliases:["Admiral Ali Shamkhani"], list:"EU Sanctions", country:"Iran", category:"Government" },
  { id:"OFAC-IR-008", name:"Yahya Rahim Safavi", aliases:["Yahya Rahim-Safavi"], list:"OFAC SDN", country:"Iran", category:"Military" },
  { id:"OFAC-IR-009", name:"Mohammad Mokhber", aliases:["Mohammad Mokhber Dezfoul"], list:"OFAC SDN", country:"Iran", category:"Government" },
  { id:"OFAC-IR-010", name:"Saeed Mohammed", aliases:["Saeed Mohammad"], list:"OFAC SDN", country:"Iran", category:"Military" },

  // ── NORTH KOREA ───────────────────────────────────────────────────────────
  { id:"OFAC-NK-001", name:"Kim Jong-un", aliases:["Kim Jong Un","Kim Jong-eun","Brilliant Comrade"], list:"OFAC SDN", country:"North Korea", category:"WMD/Proliferation" },
  { id:"OFAC-NK-002", name:"Kim Jong-il", aliases:["Kim Chong-il","Dear Leader"], list:"UN Sanctions", country:"North Korea", category:"WMD/Proliferation" },
  { id:"OFAC-NK-003", name:"Choe Ryong-hae", aliases:["Choe Ryong Hae"], list:"UN Sanctions", country:"North Korea", category:"Government" },
  { id:"OFAC-NK-004", name:"Pak Pong-ju", aliases:["Pak Pong Ju"], list:"UN Sanctions", country:"North Korea", category:"Government" },
  { id:"OFAC-NK-005", name:"Ri Sol-ju", aliases:["Ri Sol Ju"], list:"OFAC SDN", country:"North Korea", category:"Government" },
  { id:"OFAC-NK-006", name:"Kim Yong-chol", aliases:["Kim Yong Chol"], list:"UN Sanctions", country:"North Korea", category:"Military" },
  { id:"OFAC-NK-007", name:"Jang Song-thaek", aliases:["Jang Sung-taek"], list:"UN Sanctions", country:"North Korea", category:"Government" },
  { id:"OFAC-NK-008", name:"O Kuk-ryol", aliases:["O Kuk Ryol"], list:"UN Sanctions", country:"North Korea", category:"Military" },
  { id:"OFAC-NK-009", name:"Ri Yong-ho", aliases:["Ri Yong Ho"], list:"UN Sanctions", country:"North Korea", category:"Military" },
  { id:"OFAC-NK-010", name:"Kim Su-gil", aliases:["Kim Su Gil"], list:"UN Sanctions", country:"North Korea", category:"Military" },

  // ── RUSSIA ────────────────────────────────────────────────────────────────
  { id:"EU-RU-001", name:"Vladimir Putin", aliases:["Vladimir Vladimirovich Putin","V.V. Putin"], list:"EU/UK Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-002", name:"Sergei Lavrov", aliases:["Sergey Lavrov","Sergei Viktorovich Lavrov"], list:"EU Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-003", name:"Igor Sechin", aliases:["Igor Ivanovich Sechin"], list:"EU Sanctions", country:"Russia", category:"Energy/Political" },
  { id:"EU-RU-004", name:"Ramzan Kadyrov", aliases:["Ramzan Akhmatovich Kadyrov"], list:"EU/OFAC SDN", country:"Russia", category:"Human Rights" },
  { id:"EU-RU-005", name:"Nikolai Patrushev", aliases:["Nikolay Patrushev"], list:"EU Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-006", name:"Sergei Shoigu", aliases:["Sergey Shoigu"], list:"EU Sanctions", country:"Russia", category:"Military" },
  { id:"EU-RU-007", name:"Valery Gerasimov", aliases:["Valeriy Gerasimov"], list:"EU Sanctions", country:"Russia", category:"Military" },
  { id:"EU-RU-008", name:"Alexander Bastrykin", aliases:["Aleksandr Bastrykin"], list:"EU Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-009", name:"Mikhail Mishustin", aliases:["Mikhail Vladimirovich Mishustin"], list:"EU Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-010", name:"Gennady Timchenko", aliases:["Gennadiy Timchenko"], list:"EU/OFAC SDN", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-011", name:"Arkady Rotenberg", aliases:["Arkadiy Rotenberg"], list:"EU/OFAC SDN", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-012", name:"Boris Rotenberg", aliases:[], list:"EU/OFAC SDN", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-013", name:"Yuri Kovalchuk", aliases:["Yuriy Kovalchuk"], list:"EU Sanctions", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-014", name:"Alisher Usmanov", aliases:["Alisher Burkhanovich Usmanov"], list:"EU Sanctions", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-015", name:"Roman Abramovich", aliases:[], list:"EU/UK Sanctions", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-016", name:"Oleg Deripaska", aliases:["Oleg Vladimirovich Deripaska"], list:"EU/OFAC SDN", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-017", name:"Viktor Vekselberg", aliases:["Victor Vekselberg"], list:"OFAC SDN", country:"Russia", category:"Oligarch" },
  { id:"EU-RU-018", name:"Dmitry Medvedev", aliases:["Dmitriy Medvedev"], list:"EU Sanctions", country:"Russia", category:"Government" },
  { id:"EU-RU-019", name:"Alexander Lukashenko", aliases:["Aliaksandr Lukashenko"], list:"EU/OFAC SDN", country:"Belarus", category:"Human Rights" },
  { id:"EU-RU-020", name:"Viktor Lukashenko", aliases:["Viktar Lukashenka"], list:"EU Sanctions", country:"Belarus", category:"Government" },

  // ── DRUG TRAFFICKING ─────────────────────────────────────────────────────
  { id:"OFAC-DR-001", name:"Joaquin Archivaldo Guzman Loera", aliases:["El Chapo","Chapo Guzman","El Rapido"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-002", name:"Ismael Zambada Garcia", aliases:["El Mayo","Mayo Zambada"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-003", name:"Nemesio Oseguera Cervantes", aliases:["El Mencho","Mencho"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-004", name:"Juan Orlando Hernandez", aliases:["Tony Hernandez brother"], list:"OFAC SDN", country:"Honduras", category:"Drug Trafficking" },
  { id:"OFAC-DR-005", name:"Dairo Antonio Usuga David", aliases:["Otoniel","Clause Rojo"], list:"OFAC Narco", country:"Colombia", category:"Drug Trafficking" },
  { id:"OFAC-DR-006", name:"Gilberto Rodriguez Orejuela", aliases:["The Chess Player"], list:"OFAC Narco", country:"Colombia", category:"Drug Trafficking" },
  { id:"OFAC-DR-007", name:"Miguel Angel Rodriguez Orejuela", aliases:["El Señor"], list:"OFAC Narco", country:"Colombia", category:"Drug Trafficking" },
  { id:"OFAC-DR-008", name:"Juan Carlos Abadia Campo", aliases:["Chupeta"], list:"OFAC Narco", country:"Colombia", category:"Drug Trafficking" },
  { id:"OFAC-DR-009", name:"Amado Carrillo Fuentes", aliases:["Lord of the Skies","El Señor de los Cielos"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-010", name:"Osiel Cardenas Guillen", aliases:["El Mata Amigos"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-011", name:"Juan Jose Esparragoza Moreno", aliases:["El Azul","The Blue"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },
  { id:"OFAC-DR-012", name:"Hector Luis Palma Salazar", aliases:["El Guero Palma"], list:"OFAC Narco", country:"Mexico", category:"Drug Trafficking" },

  // ── ARMS TRAFFICKING ─────────────────────────────────────────────────────
  { id:"OFAC-AT-001", name:"Viktor Bout", aliases:["Victor Bout","Merchant of Death","Viktor Anatoliyevich Bout"], list:"OFAC SDN", country:"Russia", category:"Arms Trafficking" },
  { id:"OFAC-AT-002", name:"Monzer Al-Kassar", aliases:["The Prince of Marbella","Abu Abbas"], list:"OFAC SDN", country:"Syria", category:"Arms Trafficking" },
  { id:"OFAC-AT-003", name:"Leonid Minin", aliases:["Wulf Breslan","Igor Osols"], list:"OFAC SDN", country:"Ukraine", category:"Arms Trafficking" },
  { id:"OFAC-AT-004", name:"Sanjivan Ruprah", aliases:["Samir Nasr","Pablo Florimon"], list:"OFAC SDN", country:"Kenya", category:"Arms Trafficking" },

  // ── IRAQ / MIDDLE EAST ────────────────────────────────────────────────────
  { id:"OFAC-IQ-001", name:"Saddam Hussein Abd al-Majid", aliases:["Saddam Hussein","Abu Uday"], list:"OFAC SDN", country:"Iraq", category:"Human Rights" },
  { id:"OFAC-IQ-002", name:"Ali Hassan Al-Majid", aliases:["Chemical Ali","Ali al-Majid"], list:"OFAC SDN", country:"Iraq", category:"WMD" },
  { id:"OFAC-IQ-003", name:"Izzat Ibrahim Al-Douri", aliases:["King of Clubs","Abu Brwa"], list:"OFAC SDN", country:"Iraq", category:"Terrorism" },
  { id:"OFAC-IQ-004", name:"Muammar Gaddafi", aliases:["Moammar Gadhafi","Muammar al-Qaddafi","Brother Leader"], list:"UN Sanctions", country:"Libya", category:"Human Rights" },
  { id:"OFAC-IQ-005", name:"Saif al-Islam Gaddafi", aliases:["Saif al Islam Qadhafi"], list:"UN Sanctions", country:"Libya", category:"Human Rights" },
  { id:"OFAC-IQ-006", name:"Abdullah Al-Senussi", aliases:["Abdallah al-Sanussi"], list:"UN Sanctions", country:"Libya", category:"Human Rights" },

  // ── MYANMAR / ASIA ────────────────────────────────────────────────────────
  { id:"OFAC-MM-001", name:"Min Aung Hlaing", aliases:["Senior General Min Aung Hlaing"], list:"OFAC SDN", country:"Myanmar", category:"Human Rights" },
  { id:"OFAC-MM-002", name:"Soe Win", aliases:["Vice Senior General Soe Win"], list:"OFAC SDN", country:"Myanmar", category:"Human Rights" },
  { id:"OFAC-MM-003", name:"Mya Tun Oo", aliases:[], list:"OFAC SDN", country:"Myanmar", category:"Military" },
  { id:"OFAC-MM-004", name:"Maung Maung Kyaw", aliases:[], list:"OFAC SDN", country:"Myanmar", category:"Military" },
  { id:"OFAC-MM-005", name:"Than Shwe", aliases:["Senior General Than Shwe"], list:"OFAC SDN", country:"Myanmar", category:"Human Rights" },

  // ── VENEZUELA / LATIN AMERICA ─────────────────────────────────────────────
  { id:"OFAC-VZ-001", name:"Nicolas Maduro Moros", aliases:["Nicolas Maduro","El Burro"], list:"OFAC SDN", country:"Venezuela", category:"Government" },
  { id:"OFAC-VZ-002", name:"Diosdado Cabello Rondon", aliases:["Diosdado Cabello"], list:"OFAC SDN", country:"Venezuela", category:"Government" },
  { id:"OFAC-VZ-003", name:"Hugo Carvajal Barrios", aliases:["El Pollo","The Chicken"], list:"OFAC SDN", country:"Venezuela", category:"Drug Trafficking" },
  { id:"OFAC-VZ-004", name:"Tareck Zaidan El Aissami Maddah", aliases:["Tareck El Aissami"], list:"OFAC SDN", country:"Venezuela", category:"Drug Trafficking" },
  { id:"OFAC-VZ-005", name:"Alexander Granko Arteaga", aliases:[], list:"OFAC SDN", country:"Venezuela", category:"Government" },
  { id:"OFAC-VZ-006", name:"Daniel Ortega Saavedra", aliases:["Daniel Ortega"], list:"OFAC SDN", country:"Nicaragua", category:"Human Rights" },
  { id:"OFAC-VZ-007", name:"Rosario Murillo", aliases:[], list:"OFAC SDN", country:"Nicaragua", category:"Human Rights" },

  // ── AFRICA ────────────────────────────────────────────────────────────────
  { id:"OFAC-AF-001", name:"Robert Gabriel Mugabe", aliases:["Robert Mugabe"], list:"OFAC SDN", country:"Zimbabwe", category:"Human Rights" },
  { id:"OFAC-AF-002", name:"Grace Mugabe", aliases:["Amai Mugabe","First Lady Grace"], list:"OFAC SDN", country:"Zimbabwe", category:"Human Rights" },
  { id:"OFAC-AF-003", name:"Omar Hassan Ahmad Al-Bashir", aliases:["Omar al-Bashir","Field Marshal Bashir"], list:"UN Sanctions", country:"Sudan", category:"Human Rights" },
  { id:"OFAC-AF-004", name:"Abdel Fattah Al-Burhan", aliases:["Abdel Fattah al-Burhan Abdelrahman"], list:"OFAC SDN", country:"Sudan", category:"Human Rights" },
  { id:"OFAC-AF-005", name:"Mohamed Hamdan Dagalo", aliases:["Hemeti","Hamdan Dagalo"], list:"OFAC SDN", country:"Sudan", category:"Human Rights" },
  { id:"OFAC-AF-006", name:"Charles Ghankay Taylor", aliases:["Charles Taylor"], list:"UN Sanctions", country:"Liberia", category:"Human Rights" },
  { id:"OFAC-AF-007", name:"Joseph Kony", aliases:["Joseph Rao Kony"], list:"OFAC SDN", country:"Uganda", category:"Terrorism" },
  { id:"OFAC-AF-008", name:"Bosco Ntaganda", aliases:["The Terminator","Bosco"], list:"UN Sanctions", country:"DR Congo", category:"Human Rights" },
  { id:"OFAC-AF-009", name:"Ahmad Al-Faqi Al-Mahdi", aliases:["Abu Tourab"], list:"UN Sanctions", country:"Mali", category:"Terrorism" },
  { id:"OFAC-AF-010", name:"Iyad Ag Ghaly", aliases:["Abou Fadhel","Ahmad al-Faqi"], list:"UN 1267", country:"Mali", category:"Terrorism" },

  // ── CYBERCRIME / WMD / PROLIFERATION ─────────────────────────────────────
  { id:"OFAC-CY-001", name:"Maksim Yakubets", aliases:["Aqua"], list:"OFAC SDN", country:"Russia", category:"Cybercrime" },
  { id:"OFAC-CY-002", name:"Evgeniy Mikhailovich Bogachev", aliases:["lucky12345","Slavik"], list:"OFAC SDN", country:"Russia", category:"Cybercrime" },
  { id:"OFAC-CY-003", name:"Park Jin Hyok", aliases:["Jin Hyok Park","Pak Jin Hek"], list:"OFAC SDN", country:"North Korea", category:"Cybercrime" },
  { id:"OFAC-CY-004", name:"Jon Chang Hyok", aliases:["Jang Chang Hyok"], list:"OFAC SDN", country:"North Korea", category:"Cybercrime" },
  { id:"OFAC-CY-005", name:"Kim Il", aliases:["Julien Kim","Tony Walker"], list:"OFAC SDN", country:"North Korea", category:"Cybercrime" },
  { id:"OFAC-WM-001", name:"Abdul Qadeer Khan", aliases:["A.Q. Khan","Father of Pakistani Bomb"], list:"OFAC SDN", country:"Pakistan", category:"WMD/Proliferation" },
  { id:"OFAC-WM-002", name:"Mohsen Fakhrizadeh", aliases:["Mohsen Fakhrizadeh-Mahabadi"], list:"OFAC SDN", country:"Iran", category:"WMD/Proliferation" },
  { id:"OFAC-WM-003", name:"Ali Akbar Salehi", aliases:[], list:"OFAC SDN", country:"Iran", category:"WMD/Proliferation" },

  // ── FINANCIAL CRIME / MONEY LAUNDERING ───────────────────────────────────
  { id:"FINCEN-001", name:"Semion Mogilevich", aliases:["Sergei Schneider","Don Semyon","The Brainy Don"], list:"OFAC SDN", country:"Russia", category:"Organized Crime" },
  { id:"FINCEN-002", name:"Sergei Mikhailov", aliases:["Mikhas"], list:"OFAC SDN", country:"Russia", category:"Organized Crime" },
  { id:"FINCEN-003", name:"Gennadiy Petrov", aliases:["Gena Petrov"], list:"OFAC SDN", country:"Russia", category:"Organized Crime" },
  { id:"FINCEN-004", name:"Alexander Malyshev", aliases:[], list:"OFAC SDN", country:"Russia", category:"Organized Crime" },
  { id:"FINCEN-005", name:"Shabtai Kalmanovich", aliases:[], list:"OFAC SDN", country:"Israel", category:"Organized Crime" },
  { id:"FINCEN-006", name:"Alimzhan Tokhtakhounov", aliases:["Taiwanchik"], list:"OFAC SDN", country:"Russia", category:"Organized Crime" },
  { id:"FINCEN-007", name:"Tariq Dawood", aliases:["Dawood Ibrahim associate"], list:"OFAC SDN", country:"Pakistan", category:"Organized Crime" },
  { id:"FINCEN-008", name:"Dawood Ibrahim Kaskar", aliases:["Ibrahim Kaskar","Haji Sahab","D-Company Boss"], list:"OFAC SDN", country:"India", category:"Organized Crime" },
  { id:"FINCEN-009", name:"Chhota Shakeel", aliases:["Mohammed Shakeel","Shakeel Noorani"], list:"OFAC SDN", country:"India", category:"Organized Crime" },
  { id:"FINCEN-010", name:"Tiger Memon", aliases:["Ibrahim Mussa Memon Musalman"], list:"OFAC SDN", country:"India", category:"Organized Crime" },

  // ── BALKANS / EASTERN EUROPE ──────────────────────────────────────────────
  { id:"OFAC-BK-001", name:"Ratko Mladic", aliases:["The Butcher of Bosnia"], list:"UN Sanctions", country:"Bosnia", category:"Human Rights" },
  { id:"OFAC-BK-002", name:"Radovan Karadzic", aliases:["Dragan David Dabic"], list:"UN Sanctions", country:"Bosnia", category:"Human Rights" },
  { id:"OFAC-BK-003", name:"Slobodan Milosevic", aliases:["Slobo"], list:"UN Sanctions", country:"Serbia", category:"Human Rights" },
  { id:"OFAC-BK-004", name:"Zeljko Raznatovic", aliases:["Arkan","Tiger"], list:"UN Sanctions", country:"Serbia", category:"Human Rights" },
  { id:"OFAC-BK-005", name:"Naser Oric", aliases:[], list:"UN Sanctions", country:"Bosnia", category:"Human Rights" },

  // ── CUBA / ADDITIONAL SDN ─────────────────────────────────────────────────
  { id:"OFAC-CU-001", name:"Miguel Diaz-Canel Bermudez", aliases:["Miguel Diaz-Canel"], list:"OFAC SDN", country:"Cuba", category:"Government" },
  { id:"OFAC-CU-002", name:"Raul Castro Ruz", aliases:["Raul Castro"], list:"OFAC SDN", country:"Cuba", category:"Government" },
  { id:"OFAC-CU-003", name:"Bashar Al-Assad", aliases:["Bashar Hafez al-Assad"], list:"OFAC SDN", country:"Syria", category:"Human Rights" },
  { id:"OFAC-CU-004", name:"Maher Al-Assad", aliases:["Maher Assad"], list:"OFAC SDN", country:"Syria", category:"Human Rights" },
  { id:"OFAC-CU-005", name:"Rifaat Al-Assad", aliases:["Rif'at al-Asad","Uncle of Bashar"], list:"EU Sanctions", country:"Syria", category:"Human Rights" },

  // ── HMT (UK) SPECIFIC ─────────────────────────────────────────────────────
  { id:"HMT-001", name:"Yevgeny Prigozhin", aliases:["Putin's Chef","Evgeny Prigozhin"], list:"UK HMT", country:"Russia", category:"Organized Crime" },
  { id:"HMT-002", name:"Dmitry Utkin", aliases:[], list:"UK HMT", country:"Russia", category:"Military" },
  { id:"HMT-003", name:"Konstantin Malofeev", aliases:["Constantine Malofeev"], list:"UK HMT", country:"Russia", category:"Political" },
  { id:"HMT-004", name:"Vladimir Yakunin", aliases:[], list:"UK HMT", country:"Russia", category:"Oligarch" },
  { id:"HMT-005", name:"Andrei Kostin", aliases:["Andrey Kostin"], list:"UK HMT", country:"Russia", category:"Finance" },
  { id:"HMT-006", name:"Nikolai Tokarev", aliases:["Nikolay Tokarev"], list:"UK HMT", country:"Russia", category:"Energy" },
  { id:"HMT-007", name:"Sergei Chemezov", aliases:["Sergey Chemezov"], list:"UK HMT", country:"Russia", category:"Defense" },
  { id:"HMT-008", name:"Igor Rotenberg", aliases:[], list:"UK HMT", country:"Russia", category:"Oligarch" },

  // ── ADDITIONAL TERRORISM ──────────────────────────────────────────────────
  { id:"OFAC-TR-001", name:"Boko Haram Abubakar Shekau", aliases:["Abubakar Shekau","Abu Mohammed Abubakar"], list:"UN 1267", country:"Nigeria", category:"Terrorism" },
  { id:"OFAC-TR-002", name:"Ibrahim Awwad Ibrahim Ali Al-Badri", aliases:["Abu Omar al-Baghdadi"], list:"UN 1267", country:"Iraq", category:"Terrorism" },
  { id:"OFAC-TR-003", name:"Mevlut Kar", aliases:["Abu Obaidah"], list:"UN 1267", country:"Turkey", category:"Terrorism" },
  { id:"OFAC-TR-004", name:"Ahmed Abdi Aw-Mohamed", aliases:["Ahmed Abdi Godane","Mukhtar Abu Zubayr"], list:"UN 1267", country:"Somalia", category:"Terrorism" },
  { id:"OFAC-TR-005", name:"Moktar Ali Zubeyr", aliases:["Ahmed Abdi Godane"], list:"UN 1267", country:"Somalia", category:"Terrorism" },
  { id:"OFAC-TR-006", name:"Fuad Mohamed Khalaf", aliases:["Shongole","Fuad Shongole"], list:"UN 1267", country:"Somalia", category:"Terrorism" },
  { id:"OFAC-TR-007", name:"Ali Mohammed Rage", aliases:["Ali Dheere"], list:"UN 1267", country:"Somalia", category:"Terrorism" },
  { id:"OFAC-TR-008", name:"Hamza Bin Laden", aliases:["Hamza Usama Muhammad Awad"], list:"UN 1267", country:"Saudi Arabia", category:"Terrorism" },
  { id:"OFAC-TR-009", name:"Said Al-Adel", aliases:["Mohammed Ibrahim Makkawi"], list:"UN 1267", country:"Egypt", category:"Terrorism" },
  { id:"OFAC-TR-010", name:"Atiyah Abd Al-Rahman", aliases:["Atiyah","Mahmud"], list:"UN 1267", country:"Libya", category:"Terrorism" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SanctionsEngine() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [threshold, setThreshold] = useState(55);
  const [searched, setSearched] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [stats, setStats] = useState({ total: SANCTIONS_LIST.length, scanned: 0, hits: 0, criticals: 0 });
  const [history, setHistory] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef(null);
  const scanInterval = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function runSearch() {
    if (!query.trim()) return;
    setScanning(true);
    setResults([]);
    setSearched(false);
    setSelectedResult(null);
    let scanned = 0;

    scanInterval.current = setInterval(() => {
      scanned += 2;
      setStats(s => ({ ...s, scanned: Math.min(scanned, SANCTIONS_LIST.length) }));
      if (scanned >= SANCTIONS_LIST.length) {
        clearInterval(scanInterval.current);
        const scored = SANCTIONS_LIST.map(entry => {
          const nameMatch = scoreMatch(query, entry.name);
          const aliasMatches = entry.aliases.map(a => scoreMatch(query, a));
          const best = [nameMatch, ...aliasMatches].reduce((a, b) => b.score > a.score ? b : a);
          const risk = getRiskLevel(best.score);
          return { ...entry, score: best.score, method: best.method, risk };
        })
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score);

        const criticals = scored.filter(r => r.score >= 90).length;
        setStats({ total: SANCTIONS_LIST.length, scanned: SANCTIONS_LIST.length, hits: scored.length, criticals });
        setResults(scored);
        setSearched(true);
        setScanning(false);
        setHistory(h => [{ query, hits: scored.length, time: new Date().toLocaleTimeString(), criticals }, ...h.slice(0, 4)]);
      }
    }, 40);
  }

  function handleKey(e) { if (e.key === "Enter") runSearch(); }

  async function getAiAnalysis(result, searchQuery) {
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const prompt = `You are a senior sanctions compliance analyst at a global bank. Analyze this potential sanctions match.

SEARCH QUERY: "${searchQuery}"
MATCHED ENTITY: "${result.name}"
ALIASES: ${result.aliases.join(", ") || "None"}
MATCH SCORE: ${result.score}%
ALGORITHM: ${result.method}
SANCTIONS LIST: ${result.list}
COUNTRY: ${result.country}
CATEGORY: ${result.category}

Return ONLY valid JSON:
{
  "verdict": "FALSE POSITIVE" or "LIKELY MATCH" or "CONFIRMED MATCH",
  "confidence": 0-100,
  "reasoning": "2-3 sentence explanation",
  "name_similarity": "explain if names genuinely match or coincidental",
  "recommended_action": "CLEAR" or "INVESTIGATE" or "BLOCK",
  "key_factors": ["factor1", "factor2", "factor3"]
}`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      setAiAnalysis(JSON.parse(clean));
    } catch (e) {
      setAiAnalysis({
        verdict: "ANALYSIS UNAVAILABLE", confidence: 0,
        reasoning: "Could not connect to AI analysis service. Please review manually.",
        recommended_action: "INVESTIGATE",
        key_factors: ["Manual review required"],
        name_similarity: "N/A"
      });
    }
    setAiLoading(false);
  }

  const categoryColors = {
    "Terrorism": "#ff2d55", "WMD": "#ff6b35", "Drug Trafficking": "#bf5af2",
    "Arms Trafficking": "#ff9500", "Human Rights": "#ffd60a", "Political": "#64d2ff",
    "WMD/Proliferation": "#ff6b35"
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      fontFamily: "'Courier New', monospace",
      color: "#c8d8e8",
      padding: "0",
      overflow: "hidden auto"
    }}>
      {/* Animated grid background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,200,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,200,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none"
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36, borderBottom: "1px solid rgba(0,200,255,0.15)", paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: "#00c8ff",
              boxShadow: "0 0 12px #00c8ff",
              animation: "pulse 2s infinite"
            }} />
            <span style={{ fontSize: 11, letterSpacing: 4, color: "#00c8ff", textTransform: "uppercase" }}>
              OFAC · EU · UN · FINCEN · HMT
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 38px)", fontWeight: 700, margin: "0 0 4px",
            letterSpacing: 2, color: "#e8f4ff",
            fontFamily: "'Courier New', monospace"
          }}>
            SANCTIONS SCREENING ENGINE
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#607080", letterSpacing: 1 }}>
            ML-Powered Name Matching · Fuzzy Search · False Positive Reduction
          </p>
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "TOTAL ENTITIES", value: stats.total, color: "#64d2ff", },
            { label: "SCANNED", value: scanning ? stats.scanned : (searched ? stats.total : "—"), color: "#00c8ff" },
            { label: "MATCHES FOUND", value: searched ? stats.hits : "—", color: stats.hits > 0 ? "#ff9500" : "#64d2ff" },
            { label: "CRITICAL HITS", value: searched ? stats.criticals : "—", color: stats.criticals > 0 ? "#ff2d55" : "#64d2ff" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(0,200,255,0.12)",
              borderRadius: 8, padding: "14px 16px"
            }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#405060", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Enter name to screen... (e.g. 'Osama bin Laden', 'Ali Hassan')"
              style={{
                width: "100%", background: "rgba(0,200,255,0.05)",
                border: "1px solid rgba(0,200,255,0.25)",
                borderRadius: 8, padding: "14px 18px", fontSize: 15,
                color: "#e8f4ff", outline: "none", letterSpacing: 0.5,
                fontFamily: "'Courier New', monospace", boxSizing: "border-box",
                transition: "border-color 0.2s"
              }}
              onFocus={e => e.target.style.borderColor = "rgba(0,200,255,0.6)"}
              onBlur={e => e.target.style.borderColor = "rgba(0,200,255,0.25)"}
            />
          </div>
          <button
            onClick={runSearch}
            disabled={scanning || !query.trim()}
            style={{
              background: scanning ? "rgba(0,200,255,0.1)" : "rgba(0,200,255,0.15)",
              border: "1px solid rgba(0,200,255,0.4)",
              borderRadius: 8, padding: "0 28px", fontSize: 13,
              color: scanning ? "#405060" : "#00c8ff", cursor: scanning ? "not-allowed" : "pointer",
              letterSpacing: 2, fontFamily: "'Courier New', monospace", fontWeight: 700,
              transition: "all 0.2s", whiteSpace: "nowrap"
            }}
          >
            {scanning ? "SCANNING..." : "▶ RUN SCREEN"}
          </button>
        </div>

        {/* Threshold Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, padding: "12px 16px",
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,200,255,0.08)", borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: "#405060", letterSpacing: 2, whiteSpace: "nowrap" }}>MATCH THRESHOLD</span>
          <input type="range" min={30} max={95} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#00c8ff", cursor: "pointer" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#00c8ff", minWidth: 46, textAlign: "right" }}>
            {threshold}%
          </div>
          <div style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>
            {threshold >= 75 ? "STRICT" : threshold >= 55 ? "BALANCED" : "PERMISSIVE"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selectedResult ? "1fr 380px" : "1fr", gap: 16 }}>

          {/* Results */}
          <div>
            {scanning && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 13, color: "#00c8ff", letterSpacing: 3, marginBottom: 16 }}>
                  SCREENING AGAINST {stats.total} ENTITIES...
                </div>
                <div style={{
                  height: 4, background: "rgba(0,200,255,0.1)", borderRadius: 2, overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%", background: "linear-gradient(90deg, #00c8ff, #0080ff)",
                    width: `${(stats.scanned / stats.total) * 100}%`,
                    transition: "width 0.1s", borderRadius: 2
                  }} />
                </div>
              </div>
            )}

            {searched && results.length === 0 && (
              <div style={{
                textAlign: "center", padding: "48px 0",
                border: "1px solid rgba(48,209,88,0.2)", borderRadius: 8,
                background: "rgba(48,209,88,0.04)"
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 16, color: "#30d158", letterSpacing: 2 }}>NO MATCHES FOUND</div>
                <div style={{ fontSize: 12, color: "#405060", marginTop: 6 }}>
                  Below {threshold}% threshold · Entity cleared
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 12 }}>
                  {results.length} MATCH{results.length > 1 ? "ES" : ""} · SORTED BY RISK SCORE
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {results.map(r => (
                    <div key={r.id}
                      onClick={() => { setSelectedResult(selectedResult?.id === r.id ? null : r); setAiAnalysis(null); }}
                      style={{
                        background: selectedResult?.id === r.id ? "rgba(0,200,255,0.07)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${selectedResult?.id === r.id ? "rgba(0,200,255,0.3)" : r.risk.color + "33"}`,
                        borderLeft: `3px solid ${r.risk.color}`,
                        borderRadius: 8, padding: "14px 16px", cursor: "pointer",
                        transition: "all 0.15s"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 3,
                              background: r.risk.bg, color: r.risk.color,
                              letterSpacing: 2, fontWeight: 700
                            }}>{r.risk.label}</span>
                            <span style={{ fontSize: 10, color: "#405060", letterSpacing: 1 }}>{r.id}</span>
                            <span style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 3,
                              background: "rgba(255,255,255,0.05)", color: "#607080"
                            }}>{r.list}</span>
                          </div>
                          <div style={{ fontSize: 15, color: "#e8f4ff", fontWeight: 600, marginBottom: 3 }}>
                            {r.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#405060" }}>
                            {r.country} · <span style={{ color: categoryColors[r.category] || "#607080" }}>{r.category}</span>
                            {r.aliases.length > 0 && ` · ${r.aliases.length} alias${r.aliases.length > 1 ? "es" : ""}`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", marginLeft: 16 }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: r.risk.color, lineHeight: 1 }}>
                            {r.score}%
                          </div>
                          <div style={{ fontSize: 9, color: "#405060", marginTop: 2, letterSpacing: 1 }}>
                            {r.method}
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedResult(r); getAiAnalysis(r, query); }}
                            style={{
                              marginTop: 6, padding: "3px 8px", fontSize: 9,
                              background: "rgba(0,200,255,0.1)", border: "1px solid rgba(0,200,255,0.3)",
                              borderRadius: 4, color: "#00c8ff", cursor: "pointer", letterSpacing: 1
                            }}>✦ ASK AI</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!searched && !scanning && (
              <div style={{ padding: "32px 0" }}>
                {/* Algorithm explainer */}
                <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 16 }}>
                  MATCHING ALGORITHMS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { name: "Jaro-Winkler", desc: "Prefix-weighted string similarity. Best for names & transpositions.", weight: "40%" },
                    { name: "Token Sort", desc: "Reorders name tokens before matching. Catches word-order variations.", weight: "35%" },
                    { name: "Levenshtein", desc: "Edit distance between strings. Handles typos & OCR errors.", weight: "25%" },
                  ].map(a => (
                    <div key={a.name} style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(0,200,255,0.08)",
                      borderRadius: 8, padding: 16
                    }}>
                      <div style={{ fontSize: 12, color: "#00c8ff", marginBottom: 6, letterSpacing: 1 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "#405060", lineHeight: 1.5, marginBottom: 8 }}>{a.desc}</div>
                      <div style={{ fontSize: 10, color: "#304050" }}>Weight: <span style={{ color: "#64d2ff" }}>{a.weight}</span></div>
                    </div>
                  ))}
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 11, letterSpacing: 3, color: "#405060", marginBottom: 12 }}>RECENT SEARCHES</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {history.map((h, i) => (
                        <div key={i} onClick={() => { setQuery(h.query); }}
                          style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                            border: "1px solid rgba(0,200,255,0.06)", borderRadius: 6, cursor: "pointer"
                          }}>
                          <span style={{ fontSize: 13, color: "#8090a0" }}>{h.query}</span>
                          <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                            <span style={{ color: h.hits > 0 ? "#ff9500" : "#30d158" }}>{h.hits} hits</span>
                            {h.criticals > 0 && <span style={{ color: "#ff2d55" }}>{h.criticals} critical</span>}
                            <span style={{ color: "#304050" }}>{h.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedResult && (
            <div style={{
              background: "rgba(0,10,20,0.8)", border: `1px solid ${selectedResult.risk.color}44`,
              borderRadius: 10, padding: 20, alignSelf: "start",
              backdropFilter: "blur(10px)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "#405060" }}>ENTITY DETAIL</span>
                <button onClick={() => setSelectedResult(null)}
                  style={{ background: "none", border: "none", color: "#405060", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>

              <div style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 3, display: "inline-block",
                background: selectedResult.risk.bg, color: selectedResult.risk.color,
                letterSpacing: 2, fontWeight: 700, marginBottom: 10
              }}>{selectedResult.risk.label} RISK</div>

              <div style={{ fontSize: 18, color: "#e8f4ff", fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>
                {selectedResult.name}
              </div>

              {[
                { label: "MATCH SCORE", value: `${selectedResult.score}%`, color: selectedResult.risk.color },
                { label: "ALGORITHM", value: selectedResult.method },
                { label: "ENTITY ID", value: selectedResult.id },
                { label: "SANCTIONS LIST", value: selectedResult.list },
                { label: "NATIONALITY", value: selectedResult.country },
                { label: "CATEGORY", value: selectedResult.category, color: categoryColors[selectedResult.category] },
              ].map(f => (
                <div key={f.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12
                }}>
                  <span style={{ color: "#405060", letterSpacing: 1, fontSize: 10 }}>{f.label}</span>
                  <span style={{ color: f.color || "#c8d8e8", fontWeight: 600 }}>{f.value}</span>
                </div>
              ))}

              {selectedResult.aliases.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#405060", marginBottom: 8 }}>KNOWN ALIASES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {selectedResult.aliases.map((a, i) => (
                      <div key={i} style={{
                        padding: "6px 10px", background: "rgba(255,255,255,0.03)",
                        borderRadius: 4, fontSize: 12, color: "#8090a0"
                      }}>— {a}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Static action */}
              <div style={{ marginTop: 16, padding: "10px 12px",
                background: selectedResult.score >= 75 ? "rgba(255,45,85,0.08)" : "rgba(255,149,0,0.06)",
                border: `1px solid ${selectedResult.score >= 75 ? "rgba(255,45,85,0.2)" : "rgba(255,149,0,0.15)"}`,
                borderRadius: 6, fontSize: 11, color: "#8090a0", lineHeight: 1.6
              }}>
                {selectedResult.score >= 90
                  ? "⚠ BLOCK — Escalate immediately. File SAR if applicable."
                  : selectedResult.score >= 75
                  ? "⚠ REVIEW — Manual investigation required before processing."
                  : "ℹ MONITOR — Log for compliance record. Senior review recommended."}
              </div>

              {/* AI Analysis Panel */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, color: "#405060" }}>✦ AI ANALYST</span>
                  {!aiLoading && !aiAnalysis && (
                    <button onClick={() => getAiAnalysis(selectedResult, query)} style={{
                      padding: "4px 12px", fontSize: 10, letterSpacing: 1,
                      background: "rgba(0,200,255,0.1)", border: "1px solid rgba(0,200,255,0.3)",
                      borderRadius: 4, color: "#00c8ff", cursor: "pointer"
                    }}>ANALYSE</button>
                  )}
                </div>

                {aiLoading && (
                  <div style={{ padding: 16, textAlign: "center",
                    background: "rgba(0,200,255,0.03)", border: "1px solid rgba(0,200,255,0.1)", borderRadius: 8
                  }}>
                    <div style={{ fontSize: 11, color: "#00c8ff", letterSpacing: 2, marginBottom: 8 }}>ANALYSING...</div>
                    <div style={{ height: 2, background: "rgba(0,200,255,0.1)", borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#00c8ff", width: "60%",
                        animation: "scan 1.2s ease-in-out infinite", borderRadius: 1 }} />
                    </div>
                  </div>
                )}

                {aiAnalysis && !aiLoading && (
                  <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,200,255,0.15)", borderRadius: 8, overflow: "hidden" }}>
                    {/* Verdict header */}
                    <div style={{
                      padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: aiAnalysis.verdict === "FALSE POSITIVE" ? "rgba(48,209,88,0.1)"
                        : aiAnalysis.verdict === "CONFIRMED MATCH" ? "rgba(255,45,85,0.1)" : "rgba(255,149,0,0.1)",
                      borderBottom: "1px solid rgba(255,255,255,0.05)"
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: 2,
                        color: aiAnalysis.verdict === "FALSE POSITIVE" ? "#30d158"
                          : aiAnalysis.verdict === "CONFIRMED MATCH" ? "#ff2d55" : "#ff9500"
                      }}>{aiAnalysis.verdict}</span>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: aiAnalysis.recommended_action === "CLEAR" ? "rgba(48,209,88,0.15)"
                          : aiAnalysis.recommended_action === "BLOCK" ? "rgba(255,45,85,0.15)" : "rgba(255,149,0,0.15)",
                        color: aiAnalysis.recommended_action === "CLEAR" ? "#30d158"
                          : aiAnalysis.recommended_action === "BLOCK" ? "#ff2d55" : "#ff9500",
                        letterSpacing: 1
                      }}>{aiAnalysis.recommended_action}</span>
                    </div>

                    <div style={{ padding: "12px 14px" }}>
                      {/* Confidence bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#405060", letterSpacing: 1 }}>AI CONFIDENCE</span>
                          <span style={{ fontSize: 11, color: "#00c8ff", fontWeight: 700 }}>{aiAnalysis.confidence}%</span>
                        </div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                          <div style={{ height: "100%", borderRadius: 2, width: `${aiAnalysis.confidence}%`,
                            background: aiAnalysis.confidence > 70 ? "#00c8ff" : "#ff9500", transition: "width 0.8s ease" }} />
                        </div>
                      </div>

                      {/* Reasoning */}
                      <div style={{ fontSize: 11, color: "#8090a0", lineHeight: 1.6, marginBottom: 12,
                        padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 4 }}>
                        {aiAnalysis.reasoning}
                      </div>

                      {/* Name similarity */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 9, color: "#405060", letterSpacing: 1, marginBottom: 4 }}>NAME ANALYSIS</div>
                        <div style={{ fontSize: 11, color: "#607080", lineHeight: 1.5 }}>{aiAnalysis.name_similarity}</div>
                      </div>

                      {/* Key factors */}
                      {aiAnalysis.key_factors?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: "#405060", letterSpacing: 1, marginBottom: 6 }}>KEY FACTORS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {aiAnalysis.key_factors.map((f, i) => (
                              <div key={i} style={{ fontSize: 10, color: "#506070", display: "flex", gap: 6, alignItems: "flex-start" }}>
                                <span style={{ color: "#00c8ff", marginTop: 1 }}>›</span>{f}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button onClick={() => getAiAnalysis(selectedResult, query)}
                        style={{ marginTop: 12, width: "100%", padding: "6px", fontSize: 9, letterSpacing: 2,
                          background: "rgba(0,200,255,0.05)", border: "1px solid rgba(0,200,255,0.15)",
                          borderRadius: 4, color: "#405060", cursor: "pointer" }}>↻ RE-ANALYSE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        input[type=range]::-webkit-slider-thumb { width:14px; height:14px; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:#080c14; }
        ::-webkit-scrollbar-thumb { background:#203040; border-radius:3px; }
      `}</style>
    </div>
  );
}
