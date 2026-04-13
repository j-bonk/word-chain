import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function todayRange() {
  const now = new Date();
  const pacificOffset = getPacificOffset(now);
  const pacific = new Date(now.getTime() + pacificOffset);
  const start = new Date(pacific);
  start.setHours(0, 0, 0, 0);
  const end = new Date(pacific);
  end.setHours(23, 59, 59, 999);
  // Convert back to UTC for Supabase query
  return {
    start: new Date(start.getTime() - pacificOffset).toISOString(),
    end:   new Date(end.getTime()   - pacificOffset).toISOString(),
  };
}

function getPacificOffset(date) {
  // Returns offset in ms from UTC to Pacific (handles DST)
  const utcStr = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const pacificDate = new Date(utcStr);
  return pacificDate.getTime() - date.getTime();
}

export default async function handler(req, res) {
  const { start, end } = todayRange();

  // ── GET: fetch today's top 5 ──────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 's-maxage=30');
    const { data, error } = await supabase
      .from('scores')
      .select('nickname, time_remaining')
      .gte('submitted_at', start)
      .lte('submitted_at', end)
      .order('time_remaining', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST: submit a score ──────────────────────────────────
  if (req.method === 'POST') {
    const { nickname, time_remaining } = req.body;

    if (!nickname || typeof time_remaining !== 'number') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Sanity check: 2 min start + 3 words × 30s bonus = 210s max theoretical
    if (time_remaining < 0 || time_remaining > 210) {
      return res.status(400).json({ error: 'Invalid time' });
    }

    const clean = nickname.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    if (!clean) return res.status(400).json({ error: 'Invalid nickname' });

    const { error } = await supabase
      .from('scores')
      .insert({ nickname: clean, time_remaining });

    if (error) return res.status(500).json({ error: error.message });

    // Return player rank for today
    const { count } = await supabase
      .from('scores')
      .select('*', { count: 'exact', head: true })
      .gte('submitted_at', start)
      .lte('submitted_at', end)
      .gt('time_remaining', time_remaining);

    return res.status(200).json({ rank: (count ?? 0) + 1 });
  }

  res.status(405).end();
}
