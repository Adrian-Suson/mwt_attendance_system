const Chapel = require("../models/chapel");

async function listChapels(req, res) {
  try {
    const rows = await Chapel.getAllChapels();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getChapel(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const chapel = await Chapel.getChapelById(id);
    if (!chapel) return res.status(404).json({ error: "Chapel not found" });
    res.json(chapel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createChapel(req, res) {
  const { name, location, status } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const created = await Chapel.createChapel({ name, location, status });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateChapel(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const updated = await Chapel.updateChapel(id, req.body);
    if (!updated) return res.status(404).json({ error: "Chapel not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteChapel(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const removed = await Chapel.deleteChapel(id);
    if (!removed) return res.status(404).json({ error: "Chapel not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listChapels,
  getChapel,
  createChapel,
  updateChapel,
  deleteChapel,
};
