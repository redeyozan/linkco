const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cron = require('node-cron');
const cors = require('cors');

// App setup
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// DB setup
const sequelize = new Sequelize({ dialect: 'sqlite', storage: 'database.sqlite', logging: false });

// Model: original URL and slug
const Url = sequelize.define('Url', {
  originalUrl: { type: DataTypes.TEXT, allowNull: false },
  slug:        { type: DataTypes.STRING, allowNull: false, unique: true }
});

// Helper: random slug
function randomSlug(len = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: len }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

(async () => {
  // Sync schema
  await sequelize.sync({ alter: true });

  // Cleanup old entries daily
  cron.schedule('0 0 * * *', async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await Url.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    console.log('Cleaned up old links');
  });

  // Shorten endpoint
  app.post('/api/shorten', async (req, res) => {
    try {
      const { originalUrl, alias } = req.body;
      if (!originalUrl) return res.status(400).json({ error: 'originalUrl is required' });

      // Determine slug
      let slug = alias?.trim() || randomSlug();
      while (await Url.findOne({ where: { slug } })) slug = randomSlug();

      // Save entry
      await Url.create({ originalUrl, slug });

      const shortUrl = `${req.protocol}://${req.get('host')}/${slug}`;
      return res.json({ shortUrl, slug });
    } catch (e) {
      console.error('Shorten error:', e);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Redirect
  app.get('/:slug', async (req, res) => {
    try {
      const entry = await Url.findOne({ where: { slug: req.params.slug } });
      if (!entry) return res.status(404).send('Not found');
      return res.redirect(entry.originalUrl);
    } catch (e) {
      console.error('Redirect error:', e);
      return res.status(500).send('Server error');
    }
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
})();