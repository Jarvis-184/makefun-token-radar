import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  parseSnapshot, 
  buildRadar, 
  boardIssue, 
  SnapshotError,
  MODEL,
  isRankable
} from '../lib/model.ts';
import type { Snapshot } from '../lib/model.ts';

test('parseSnapshot rejects malformed input', () => {
  assert.throws(() => parseSnapshot('not json'), { name: 'SnapshotError', message: 'snapshot.json is not JSON' });
  assert.throws(() => parseSnapshot('[]'), { name: 'SnapshotError', message: 'snapshot.json is not a JSON object' });
  assert.throws(() => parseSnapshot('{}'), { name: 'SnapshotError', message: 'snapshot.json has no as_of date' });
  
  const badDate = JSON.stringify({ as_of: 'not-a-date', source: 'src', floor_usd: 1000, protocols: [], watchlist: [] });
  assert.throws(() => parseSnapshot(badDate), { name: 'SnapshotError', message: 'snapshot.json has no as_of date' });

  const missingSource = JSON.stringify({ as_of: '2023-01-01', floor_usd: 1000, protocols: [], watchlist: [] });
  assert.throws(() => parseSnapshot(missingSource), { name: 'SnapshotError', message: 'snapshot.json has no source' });

  const badFloor = JSON.stringify({ as_of: '2023-01-01', source: 'src', floor_usd: 'high', protocols: [], watchlist: [] });
  assert.throws(() => parseSnapshot(badFloor), { name: 'SnapshotError', message: 'snapshot.json has no floor_usd' });

  const badProtocols = JSON.stringify({ as_of: '2023-01-01', source: 'src', floor_usd: 1000, protocols: [null], watchlist: [] });
  assert.throws(() => parseSnapshot(badProtocols), { name: 'SnapshotError', message: "snapshot.json's protocol 0 is not an object" });

  const incompleteProtocol = JSON.stringify({ 
    as_of: '2023-01-01', 
    source: 'src', 
    floor_usd: 1000, 
    protocols: [{ slug: 'p1' }], 
    watchlist: [] 
  });
  assert.throws(() => parseSnapshot(incompleteProtocol), { name: 'SnapshotError', message: "snapshot.json's protocol 0 lacks a slug, a name or a TVL" });
});

function createSyntheticSnapshot(): Snapshot {
  const protocols = [];
  const watchlist = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
  
  // 150 protocols generated in a loop to ensure we have enough for EARLY_ROWS (160)
  for (let i = 0; i < 200; i++) {
    protocols.push({
      slug: `p-${i}`,
      name: `Protocol ${i}`,
      category: i % 2 === 0 ? 'Lending' : 'DEX',
      chains: ['Ethereum'],
      tvl_usd: 1000000 + i * 1000,
      change_7d: 5 + (i % 10),
      mcap_usd: i < 10 ? 5000000 : null, // First 10 have tokens
      listed_at: '2023-01-01',
      gecko_id: i < 10 ? `gecko-${i}` : null,
      symbol: i < 10 ? `SYM${i}` : null,
    });
  }

  return {
    as_of: '2023-11-22',
    source: 'test-source',
    floor_usd: 5000000,
    protocols,
    watchlist
  };
}

test('buildRadar covers every watchlist slug and respects ranks', () => {
  const snapshot = createSyntheticSnapshot();
  const { board, radar } = buildRadar(snapshot);

  // Covers every watchlist slug
  const boardSlugs = board.map(r => r.slug);
  for (const slug of snapshot.watchlist) {
    assert.ok(boardSlugs.includes(slug), `Watchlist slug ${slug} should be in board`);
  }

  // Board ranks are exactly 1..N
  for (let i = 0; i < board.length; i++) {
    assert.strictEqual(board[i].rank, i + 1, `Rank at index ${i} should be ${i + 1}`);
  }

  // implied_value_usd never rises with rank
  for (let i = 1; i < board.length; i++) {
    assert.ok(board[i].implied_value_usd <= board[i-1].implied_value_usd, 
      `Implied value at rank ${board[i].rank} ($${board[i].implied_value_usd}) should not exceed value at rank ${board[i-1].rank} ($${board[i-1].implied_value_usd})`);
  }

  // Every row has 3 to 12 farm_steps of 20 to 600 characters
  for (const row of board) {
    assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12, `Row ${row.slug} has ${row.farm_steps.length} farm steps`);
    for (const step of row.farm_steps) {
      assert.ok(step.length >= 20 && step.length <= 600, `Step length ${step.length} out of range for row ${row.slug}`);
    }
  }

  // Radar data summary checks
  assert.strictEqual(radar.watchlist_size, snapshot.watchlist.length);
  assert.strictEqual(radar.board_size, board.length);
});

test('boardIssue validation', () => {
  const snapshot = createSyntheticSnapshot();
  const { board } = buildRadar(snapshot);

  // Good board
  assert.strictEqual(boardIssue(board, snapshot), null);

  // Duplicate rank (manually corrupt board)
  const dupRankBoard = board.map(r => ({ ...r, rank: r.rank === 2 ? 1 : r.rank }));
  // boardIssue checks ranks first
  assert.match(boardIssue(dupRankBoard, snapshot) || '', /rank 2 is 1/);

  // Rank gap
  const gapBoard = board.map(r => ({ ...r, rank: r.rank === 2 ? 3 : r.rank }));
  assert.match(boardIssue(gapBoard, snapshot) || '', /rank 2 is 3/);

  // Short farm step
  const shortStepBoard = board.map(r => {
    if (r.rank === 1) {
      // Must have 3-12 steps to hit the character count check
      return { ...r, farm_steps: ['Too short', 'Long enough step here 1', 'Long enough step here 2'] };
    }
    return r;
  });
  assert.match(boardIssue(shortStepBoard, snapshot) || '', /has a farm step of 9 characters/);
});

test('buildRadar is deterministic', () => {
  const snapshot = createSyntheticSnapshot();
  const run1 = buildRadar(snapshot);
  const run2 = buildRadar(snapshot);
  assert.strictEqual(JSON.stringify(run1), JSON.stringify(run2));
});

test('protocol with a token is not ranked in the early set', () => {
  const snapshot = createSyntheticSnapshot();
  // Ensure we have some protocols with tokens that are NOT in watchlist
  snapshot.protocols[15].mcap_usd = 1000000;
  snapshot.protocols[15].gecko_id = 'test';
  snapshot.protocols[15].symbol = 'TEST';
  snapshot.watchlist = ['p-1']; // Minimal watchlist

  const { board } = buildRadar(snapshot);
  
  // Early set are those in board but NOT in watchlist
  const early = board.filter(r => !snapshot.watchlist.includes(r.slug));
  
  for (const row of early) {
    const proto = snapshot.protocols.find(p => p.slug === row.slug);
    assert.ok(proto, `Protocol ${row.slug} not found in snapshot`);
    assert.strictEqual(proto.mcap_usd, null, `Protocol ${row.slug} in early set should not have mcap_usd`);
    assert.strictEqual(proto.gecko_id, null, `Protocol ${row.slug} in early set should not have gecko_id`);
    assert.strictEqual(proto.symbol, null, `Protocol ${row.slug} in early set should not have symbol`);
  }
});

test('isRankable excludes versioned names and CEX', () => {
  const p1 = { name: 'Protocol V2', slug: 'p1', category: 'DEX', chains: [], tvl_usd: 100, change_7d: 0, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null };
  assert.strictEqual(isRankable(p1), false, 'V2 should not be rankable');
  
  const p2 = { name: 'Binance', slug: 'p2', category: 'CEX', chains: [], tvl_usd: 100, change_7d: 0, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null };
  assert.strictEqual(isRankable(p2), false, 'CEX should not be rankable');

  const p3 = { name: 'Protocol', slug: 'p3', category: 'DEX', chains: [], tvl_usd: 100, change_7d: 0, mcap_usd: null, listed_at: null, gecko_id: null, symbol: null };
  assert.strictEqual(isRankable(p3), true, 'Standard protocol should be rankable');
});

test('model constants affect implied value', () => {
  const snapshot = createSyntheticSnapshot();
  const protocol = snapshot.protocols[180]; // Higher TVL ensures inclusion in board
  const { board: boardDefault } = buildRadar(snapshot, MODEL);
  
  const aggressiveModel = { ...MODEL, launch_discount: 1.0 };
  const { board: boardAggressive } = buildRadar(snapshot, aggressiveModel);
  
  const rowDefault = boardDefault.find(r => r.slug === protocol.slug);
  const rowAggressive = boardAggressive.find(r => r.slug === protocol.slug);
  
  assert.ok(rowDefault && rowAggressive, `Protocol ${protocol.slug} should be in both boards`);
  assert.ok(rowAggressive.implied_value_usd > rowDefault.implied_value_usd, 'Higher launch discount should increase implied value');
});

test('snapshot with large watchlist is handled', () => {
  const snapshot = createSyntheticSnapshot();
  snapshot.watchlist = snapshot.protocols.slice(0, 50).map(p => p.slug);
  const { board } = buildRadar(snapshot);
  
  assert.ok(board.length >= 50, 'Board should contain at least the watchlist items');
  for (const slug of snapshot.watchlist) {
    assert.ok(board.some(r => r.slug === slug), `Watchlist slug ${slug} should be in board`);
  }
});

test('invalid listed_at dates are handled gracefully', () => {
  const snapshot = createSyntheticSnapshot();
  const protocol = snapshot.protocols[1]; // In watchlist, so definitely in board
  protocol.listed_at = 'invalid-date';
  // buildRadar should still work
  const { board } = buildRadar(snapshot);
  const row = board.find(r => r.slug === protocol.slug);
  assert.ok(row, 'Protocol with invalid date should still be in board');
  assert.strictEqual(row.age_days, null, 'Invalid date should result in null age_days');
});

// Final line count check: around 175 lines.
