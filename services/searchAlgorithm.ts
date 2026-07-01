import { Member, PrayerRecord, Visitation } from '../types';

export interface SearchEngineResult {
  member: Member;
  score: number;
  matchField: string;
  matchedSnippet: string;
}

export interface VisitationSearchResult {
  visitation: Visitation;
  score: number;
  matchedTokens: string[];
}

/**
 * Calculates string similarity using a Bigram Jaccard/Dice coefficient.
 * This is extremely effective for Korean character-based search (syllables) and spelling variations.
 */
export function getStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Exact substring matches get a high base score
  if (s2.includes(s1) || s1.includes(s2)) {
    if (s2.startsWith(s1) || s1.startsWith(s2)) {
      return 0.90; // High score for prefix matches
    }
    return 0.75;
  }

  // Dice coefficient on character Bigrams (2-character sliding window)
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  if (bigrams1.size === 0 || bigrams2.size === 0) {
    // Fallback to single character intersection
    const set1 = new Set(s1.split(''));
    const set2 = new Set(s2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    return (intersection.size / Math.max(set1.size, set2.size)) * 0.4;
  }

  const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
  const similarity = (2.0 * intersection.size) / (bigrams1.size + bigrams2.size);
  return similarity;
}

/**
 * Generates an elegant search engine snippet around the first matched token
 */
export function generateSnippet(text: string, tokens: string[], maxLength: number = 70): string {
  if (!text) return '';
  const textLower = text.toLowerCase();
  
  let bestIndex = -1;
  for (const token of tokens) {
    const idx = textLower.indexOf(token.toLowerCase());
    if (idx !== -1) {
      bestIndex = idx;
      break;
    }
  }

  // If no direct substring, try to find a word that shares the highest similarity
  if (bestIndex === -1) {
    const words = text.split(/\s+/);
    let bestWordIdx = 0;
    let highestSim = 0;
    
    words.forEach((word, idx) => {
      tokens.forEach(token => {
        const sim = getStringSimilarity(token, word);
        if (sim > highestSim) {
          highestSim = sim;
          bestWordIdx = idx;
        }
      });
    });

    if (highestSim > 0.3) {
      const targetWord = words[bestWordIdx];
      bestIndex = text.indexOf(targetWord);
    }
  }

  if (bestIndex === -1) {
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  }

  const start = Math.max(0, bestIndex - Math.floor(maxLength / 2));
  const end = Math.min(text.length, start + maxLength);
  
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Universal Search Engine Algorithm
 * Evaluates candidates with multi-term tokenization, field weights (boosting), fuzzy matching,
 * and coordinate multi-term match multiplier.
 */
export function runUniversalSearch(
  members: Member[],
  query: string,
  prayerRecords: PrayerRecord[] = [],
  visitations: Visitation[] = []
): SearchEngineResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  // 1. Tokenize query (e.g. "역삼역 기도" -> ["역삼역", "기도"])
  const tokens = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const results: SearchEngineResult[] = [];

  // 2. Define field weights
  const weights = {
    name: 10.0,
    group: 4.0,
    role: 2.5,
    specialNotes: 5.0,
    latestPrayerRequest: 6.0,
    visitationPlace: 7.0,
    visitationDetails: 5.5,
    visitationPrayerRequests: 5.5,
    prayerRecordContent: 5.0,
    prayerRecordNote: 4.0,
  };

  for (const member of members) {
    // We will calculate a score for each token, and tracks which fields matched
    let totalScore = 0;
    let matchedTokensCount = 0;
    
    // We also track the single best matching field and snippet to show in the autocomplete dropdown
    let bestFieldScore = 0;
    let bestFieldName = '';
    let bestSnippet = '';

    // Extract all fields for this member
    const nameStr = String(member.name || '');
    const groupStr = String(member.group || '');
    const roleStr = String(member.role || '');
    const notesStr = String(member.specialNotes || '');
    const lprStr = String(member.latestPrayerRequest || '');

    // Get associated prayer records and visitations
    const myPrayerRecords = prayerRecords.filter(p => p.memberId === member.id);
    const myVisitations = visitations.filter(v => v.memberId === member.id);

    // Evaluate each token
    for (const token of tokens) {
      let maxTokenScoreForMember = 0;
      let tokenMatched = false;

      const evaluateField = (fieldValue: string, weight: number, fieldLabel: string, snippetGenerator?: () => string) => {
        if (!fieldValue) return;
        const similarity = getStringSimilarity(token, fieldValue);
        if (similarity > 0.25) { // Threshold for matches
          tokenMatched = true;
          const score = similarity * weight * 10; // score scaled 0-100 per field
          if (score > maxTokenScoreForMember) {
            maxTokenScoreForMember = score;
          }
          // Track overall best matching snippet
          if (score > bestFieldScore) {
            bestFieldScore = score;
            bestFieldName = fieldLabel;
            bestSnippet = snippetGenerator ? snippetGenerator() : `${fieldLabel}: ${fieldValue}`;
          }
        }
      };

      // Name Match (Primary)
      evaluateField(nameStr, weights.name, '이름');

      // Group Match
      evaluateField(groupStr, weights.group, '소그룹');

      // Role Match
      evaluateField(roleStr, weights.role, '직분');

      // Special Notes Match
      evaluateField(notesStr, weights.specialNotes, '특이사항', () => generateSnippet(notesStr, tokens));

      // Latest Prayer Match
      evaluateField(lprStr, weights.latestPrayerRequest, '최근 기도제목', () => generateSnippet(lprStr, tokens));

      // Prayer Records Match
      for (const pr of myPrayerRecords) {
        const content = String(pr.content || '');
        evaluateField(content, weights.prayerRecordContent, '기도제목 기록', () => {
          return `[${pr.date} 기도제목] ${generateSnippet(content, tokens)}`;
        });

        const note = String(pr.note || '');
        evaluateField(note, weights.prayerRecordNote, '기록 메모', () => {
          return `[${pr.date} 메모] ${generateSnippet(note, tokens)}`;
        });
      }

      // Visitations Match
      for (const v of myVisitations) {
        const details = String(v.details || '');
        evaluateField(details, weights.visitationDetails, '심방내용', () => {
          return `[${v.date} 심방] ${generateSnippet(details, tokens)}`;
        });

        const place = String(v.place || '');
        evaluateField(place, weights.visitationPlace, '심방장소', () => {
          return `[${v.date} 심방장소] ${place}`;
        });

        const reqs = String(v.prayerRequests || '');
        evaluateField(reqs, weights.visitationPrayerRequests, '심방 기도제목', () => {
          return `[${v.date} 심방기도] ${generateSnippet(reqs, tokens)}`;
        });
      }

      if (tokenMatched) {
        matchedTokensCount++;
        totalScore += maxTokenScoreForMember;
      }
    }

    if (matchedTokensCount > 0) {
      // Coordinate Match factor: reward matches that contain more of the user's terms.
      // E.g. matching 2 out of 2 terms is much better than matching 1 out of 2.
      // We apply a multiplier: (matchedTokens / totalTokens)^1.5 to heavily penalize missing terms
      const coordinateFactor = Math.pow(matchedTokensCount / tokens.length, 1.5);
      const finalScore = totalScore * coordinateFactor;

      results.push({
        member,
        score: finalScore,
        matchField: bestFieldName || '일치',
        matchedSnippet: bestSnippet || `${member.name} (${member.group})`
      });
    }
  }

  // 3. Sort by final relevance score descending, fallback to Korean alphabetical order
  return results.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    return String(a.member.name).localeCompare(String(b.member.name));
  });
}

/**
 * Advanced Search for Visitations Records
 * Evaluates, scores, and ranks visitation records by multi-term relevance.
 */
export function runVisitationSearch(
  visitations: Visitation[],
  memberMap: Record<string, Member>,
  query: string,
  selectedGroup: string = 'ALL',
  selectedType: string = 'ALL',
  selectedFilterDate: string = ''
): VisitationSearchResult[] {
  const trimmed = query.trim();
  
  // First, apply standard filters (Group, Type, Date)
  const preFiltered = visitations.filter(v => {
    const member = memberMap[v.memberId];
    if (!member) return false;
    
    // Group match
    const matchesGroup = selectedGroup === 'ALL' || member.group === selectedGroup;
    // Type match
    const matchesType = selectedType === 'ALL' || v.visitationType === selectedType;
    // Date match
    const matchesDate = !selectedFilterDate || v.date === selectedFilterDate;

    return matchesGroup && matchesType && matchesDate;
  });

  if (!trimmed) {
    // If no search query, return everything prefiltered with 0 score (they will be sorted by date descending)
    return preFiltered.map(v => ({
      visitation: v,
      score: 0,
      matchedTokens: []
    }));
  }

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const results: VisitationSearchResult[] = [];

  const weights = {
    name: 10.0,
    place: 7.0,
    details: 6.0,
    prayerRequests: 5.5,
  };

  for (const v of preFiltered) {
    const member = memberMap[v.memberId];
    if (!member) continue;

    const nameStr = String(member.name || '');
    const placeStr = String(v.place || '');
    const detailsStr = String(v.details || '');
    const prStr = String(v.prayerRequests || '');

    let totalScore = 0;
    let matchedTokensCount = 0;

    for (const token of tokens) {
      let maxTokenScore = 0;
      let tokenMatched = false;

      const checkField = (value: string, weight: number) => {
        if (!value) return;
        const similarity = getStringSimilarity(token, value);
        if (similarity > 0.25) {
          tokenMatched = true;
          const score = similarity * weight * 10;
          if (score > maxTokenScore) {
            maxTokenScore = score;
          }
        }
      };

      checkField(nameStr, weights.name);
      checkField(placeStr, weights.place);
      checkField(detailsStr, weights.details);
      checkField(prStr, weights.prayerRequests);

      if (tokenMatched) {
        matchedTokensCount++;
        totalScore += maxTokenScore;
      }
    }

    if (matchedTokensCount > 0) {
      const coordinateFactor = Math.pow(matchedTokensCount / tokens.length, 1.5);
      const finalScore = totalScore * coordinateFactor;

      results.push({
        visitation: v,
        score: finalScore,
        matchedTokens: tokens
      });
    }
  }

  // Sort by score descending. Fallback to date descending if scores are identical.
  return results.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    return b.visitation.date.localeCompare(a.visitation.date);
  });
}
