import { Notification } from '../models.js';

export function registerNotificationRoutes(app, { wrap, assert }) {
  app.get('/api/notifications', wrap(async (req, res) => {
    res.json(await Notification.find({
      userId: String(req.user._id)
    }).sort({
      createdAt: -1
    }).limit(Math.min(Number(req.query.limit) || 50, 100)));
  }));

  app.patch('/api/notifications/:id/read', wrap(async (req, res) => {
    const notification = await Notification.findOneAndUpdate({
      id: req.params.id,
      userId: String(req.user._id)
    }, {
      $set: { readAt: new Date().toISOString() }
    }, {
      new: true
    });
    assert(notification, 'Notification not found');
    res.json(notification);
  }));

  app.post('/api/notifications/read-all', wrap(async (req, res) => {
    await Notification.updateMany({
      userId: String(req.user._id),
      readAt: ''
    }, {
      $set: { readAt: new Date().toISOString() }
    });
    res.json({ ok: true });
  }));
}
