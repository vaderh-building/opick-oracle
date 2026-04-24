// 50-candidate Attention Index pool for one-shot 24-hour polling.
// Shape matches the poll script; not used by the cron or oracle core.

export interface Candidate {
  name: string;
  query: string;
  handle: string | null;
  category:
    | "tech"
    | "politics"
    | "music_film"
    | "sports"
    | "creators"
    | "commentary";
}

export const CANDIDATES_50: Candidate[] = [
  // Tech / business (8)
  { name: "Elon Musk", query: '"Elon Musk"', handle: "@elonmusk", category: "tech" },
  { name: "Sam Altman", query: '"Sam Altman"', handle: "@sama", category: "tech" },
  { name: "Mark Zuckerberg", query: '"Mark Zuckerberg"', handle: "@finkd", category: "tech" },
  { name: "Jeff Bezos", query: '"Jeff Bezos"', handle: "@JeffBezos", category: "tech" },
  { name: "Jensen Huang", query: '"Jensen Huang"', handle: null, category: "tech" },
  { name: "Sundar Pichai", query: '"Sundar Pichai"', handle: "@sundarpichai", category: "tech" },
  { name: "Tim Cook", query: '"Tim Cook"', handle: "@tim_cook", category: "tech" },
  { name: "Dario Amodei", query: '"Dario Amodei"', handle: "@DarioAmodei", category: "tech" },

  // Politics (10)
  { name: "Donald Trump", query: '"Donald Trump"', handle: "@realDonaldTrump", category: "politics" },
  { name: "JD Vance", query: '"JD Vance"', handle: "@JDVance", category: "politics" },
  { name: "Kamala Harris", query: '"Kamala Harris"', handle: "@KamalaHarris", category: "politics" },
  { name: "Barack Obama", query: '"Barack Obama"', handle: "@BarackObama", category: "politics" },
  { name: "Xi Jinping", query: '"Xi Jinping"', handle: null, category: "politics" },
  { name: "Vladimir Putin", query: '"Putin"', handle: null, category: "politics" },
  { name: "Volodymyr Zelensky", query: '"Zelensky"', handle: "@ZelenskyyUa", category: "politics" },
  { name: "Benjamin Netanyahu", query: '"Netanyahu"', handle: "@netanyahu", category: "politics" },
  { name: "AOC", query: '"AOC" OR "Ocasio-Cortez"', handle: "@AOC", category: "politics" },
  { name: "Javier Milei", query: '"Milei"', handle: "@JMilei", category: "politics" },

  // Music / film (10)
  { name: "Taylor Swift", query: '"Taylor Swift"', handle: "@taylorswift13", category: "music_film" },
  { name: "Beyoncé", query: '"Beyonce"', handle: "@Beyonce", category: "music_film" },
  { name: "Drake", query: '"Drake rapper" OR from:Drake', handle: "@Drake", category: "music_film" },
  { name: "Kanye West", query: '"Kanye" OR "Ye"', handle: "@kanyewest", category: "music_film" },
  { name: "Rihanna", query: '"Rihanna"', handle: "@rihanna", category: "music_film" },
  { name: "Bad Bunny", query: '"Bad Bunny"', handle: "@sanbenito", category: "music_film" },
  { name: "Sabrina Carpenter", query: '"Sabrina Carpenter"', handle: "@SabrinaAnnLynn", category: "music_film" },
  { name: "Billie Eilish", query: '"Billie Eilish"', handle: "@billieeilish", category: "music_film" },
  { name: "Timothée Chalamet", query: '"Timothee Chalamet"', handle: "@RealChalamet", category: "music_film" },
  { name: "Zendaya", query: '"Zendaya"', handle: "@Zendaya", category: "music_film" },

  // Sports (6)
  { name: "LeBron James", query: '"LeBron"', handle: "@KingJames", category: "sports" },
  { name: "Lionel Messi", query: '"Messi"', handle: "@TeamMessi", category: "sports" },
  { name: "Cristiano Ronaldo", query: '"Ronaldo"', handle: "@Cristiano", category: "sports" },
  { name: "Caitlin Clark", query: '"Caitlin Clark"', handle: "@CaitlinClark22", category: "sports" },
  { name: "Shohei Ohtani", query: '"Ohtani"', handle: null, category: "sports" },
  { name: "Patrick Mahomes", query: '"Mahomes"', handle: "@PatrickMahomes", category: "sports" },

  // Creators / influencers (12)
  { name: "MrBeast", query: '"MrBeast"', handle: "@MrBeast", category: "creators" },
  { name: "Kim Kardashian", query: '"Kim Kardashian"', handle: "@KimKardashian", category: "creators" },
  { name: "Kylie Jenner", query: '"Kylie Jenner"', handle: "@KylieJenner", category: "creators" },
  { name: "Charli D'Amelio", query: '"Charli DAmelio"', handle: "@charlidamelio", category: "creators" },
  { name: "Addison Rae", query: '"Addison Rae"', handle: "@whoisaddison", category: "creators" },
  { name: "Bella Poarch", query: '"Bella Poarch"', handle: "@bellapoarch", category: "creators" },
  { name: "Khaby Lame", query: '"Khaby Lame"', handle: "@KhabyLame", category: "creators" },
  { name: "Logan Paul", query: '"Logan Paul"', handle: "@LoganPaul", category: "creators" },
  { name: "Jake Paul", query: '"Jake Paul"', handle: "@jakepaul", category: "creators" },
  { name: "IShowSpeed", query: '"IShowSpeed" OR "ishowspeed"', handle: "@ishowspeedsui", category: "creators" },
  { name: "Kai Cenat", query: '"Kai Cenat"', handle: "@KaiCenat", category: "creators" },
  { name: "Emma Chamberlain", query: '"Emma Chamberlain"', handle: "@emmachamberlain", category: "creators" },

  // Podcast / commentary (4)
  { name: "Joe Rogan", query: '"Joe Rogan"', handle: "@joerogan", category: "commentary" },
  { name: "Lex Fridman", query: '"Lex Fridman"', handle: "@lexfridman", category: "commentary" },
  { name: "Andrew Huberman", query: '"Huberman"', handle: "@hubermanlab", category: "commentary" },
  { name: "Tucker Carlson", query: '"Tucker Carlson"', handle: "@TuckerCarlson", category: "commentary" },
];
