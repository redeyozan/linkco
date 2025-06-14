const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cron = require('node-cron');
const cors = require('cors');

// Initialize Express
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite',
  logging: false,
});

// Define URL model
const Url = sequelize.define('Url', {
  originalUrl: { type: DataTypes.TEXT, allowNull: false },
  slug:        { type: DataTypes.STRING, allowNull: false, unique: true }
}, {
  timestamps: true,
});

// Helper: generate random slug
function generateRandomSlug(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

(async () => {
  // Sync database (apply any new columns)
  await sequelize.sync({ alter: true });

  // Cleanup: delete URLs older than 7 days every midnight
  cron.schedule('0 0 * * *', async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await Url.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
    console.log('Cleaned up old URLs');
  });

  // API: shorten URL
  app.post('/api/shorten', async (req, res) => {
    try {
      const { originalUrl, alias } = req.body;
      if (!originalUrl) {
        return res.status(400).json({ error: 'originalUrl is required' });
      }

      let slug = alias && alias.trim() !== '' ? alias.trim() : generateRandomSlug();
      // Ensure unique slug
      while (await Url.findOne({ where: { slug } })) {
        slug = generateRandomSlug();
      }

      // Save to DB
      await Url.create({ originalUrl, slug });

      // Build short URL
      const shortUrl = `${req.protocol}://${req.get('host')}/${slug}`;
      return res.json({ shortUrl });
    } catch (err) {
      console.error('Shorten error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API: get history
  app.get('/api/history', async (req, res) => {
    try {
      const urls = await Url.findAll({ order: [['createdAt', 'DESC']] });
      return res.json(urls);
    } catch (err) {
      console.error('History error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Redirect
  app.get('/:slug', async (req, res) => {
    try {
      const url = await Url.findOne({ where: { slug: req.params.slug } });
      if (!url) {
        return res.status(404).send('404: Link not found');
      }
      return res.redirect(url.originalUrl);
    } catch (err) {
      console.error('Redirect error:', err);
      return res.status(500).send('Server error');
    }
  });

  // Start server on given PORT
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();