// Express framework'ünü import ediyoruz
const express = require('express');

// Router instance oluşturuyoruz - modüler route yapısı için
const router = express.Router();

// Category model'ini import ediyoruz
const Category = require('../models/Categories');

const Plant = require('../models/Plants');

const upload = require('../config/multer');
const path = require('path');
const fs = require('fs');

const queryBuilder = require('../utils/queryBuilder');


// ===== CATEGORY CRUD İŞLEMLERİ (Create, Read, Update, Delete) =====

// 1. READ - Tüm kategorileri getir (GET /api/categories)
router.get('/', async (req, res) => {
  try {
    const result = await queryBuilder(Category, req, {
      defaultLimit: 5,
      maxLimit: 50,
      defaultSort: 'createdAt',
      allowedSortFields: ['name', 'createdAt', 'updatedAt'],
      allowedFilterFields: ['name', 'description', 'parentId'],
      searchFields: ['name', 'description'],
      dateField: 'createdAt'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// 5. READ - Kategori ağacı yapısını getir (GET /api/categories/tree)
router.get('/tree', async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const map = new Map();

    categories.forEach(cat => map.set(cat._id.toString(), { ...cat, children: [] }));

    const tree = [];
    categories.forEach(cat => {
      if (cat.parentId) {
        const parent = map.get(cat.parentId.toString());
        if (parent) parent.children.push(map.get(cat._id.toString()));
      } else {
        tree.push(map.get(cat._id.toString()));
      }
    });

    res.json({ success: true, data: tree });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/categories/most-popular → en çok bitki olan kategoriler
router.get('/most-popular', async (req, res) => {
  try {
    const result = await Plant.aggregate([
      { $unwind: '$categoryIds' }, // Her kategori için ayrı kayıt üret
      { $group: { _id: '$categoryIds', count: { $sum: 1 } } }, // kategoriye göre grupla
      { $sort: { count: -1 } }, // çoktan aza sırala
      {
        $lookup: {
          from: 'categories', // category koleksiyonundan
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' }, // tek objeye indir
      {
        $project: {
          _id: 0,
          categoryId: '$category._id',
          name: '$category.name',
          icon: '$category.icon',
          count: 1
        }
      }
    ]);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// Tüm kategoriler + varsa bitki sayısı, yoksa 0
router.get('/with-counts', async (req, res) => {
  try {
    const result = await Category.aggregate([
      {
        $lookup: {
          from: 'plants',
          localField: '_id',
          foreignField: 'categoryIds',
          as: 'plants'
        }
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id',
          name: 1,
          icon: 1,
          count: { $size: '$plants' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});




// 4. READ - Kategoriye ait alt kategorileri getir (GET /api/categories/:id/children)
router.get('/:id/children', async (req, res) => {
  try {
    const children = await Category.find({ parentId: req.params.id });
    res.json({ success: true, data: children });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. READ - Kategoriye ait bitkileri getir (GET /api/categories/:id/plants)
router.get('/:id/plants', async (req, res) => {
    try {
        const categoryId = req.params.id;

        // Bu kategoriye ait tüm bitkileri bul
        const plants = await Plant.find({ categoryIds: categoryId }).populate('categoryIds');

        // Görsel URL'si ekleyelim
        const plantsWithImageUrl = plants.map(plant => ({
            ...plant.toObject(),
            imageUrl: `${req.protocol}://${req.get('host')}/images/${plant.image}`
        }));

        res.json({
            success: true,
            data: plantsWithImageUrl
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// 2. READ - Tek kategori getir (GET /api/categories/:id)
router.get('/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Kategori bulunamadı'
            });
        }

        res.json({
            success: true,
            data: category
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});




// 3. CREATE - Yeni kategori oluştur (POST /api/categories)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, description, icon, parentId } = req.body;

    const category = new Category({
      name,
      description,
      icon,
      parentId,
      image: req.file ? req.file.filename : undefined
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Kategori başarıyla oluşturuldu',
      data: {
        ...category.toObject(),
        imageUrl: req.file
          ? `${req.protocol}://${req.get('host')}/images/${req.file.filename}`
          : null
      }
    });
  } catch (error) {
    // Yüklenen dosyayı sil (hata varsa)
    if (req.file) {
      fs.unlink(path.join('public/images', req.file.filename), () => {});
    }

    res.status(400).json({ success: false, message: error.message });
  }
});

// 4. UPDATE - Kategori güncelle (PUT /api/categories/:id)
router.put('/:id', async (req, res) => {
    try {
        const { name, description, icon } = req.body;

        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { name, description, icon },
            {
                new: true,
                runValidators: true
            }
        );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Kategori bulunamadı'
            });
        }

        res.json({
            success: true,
            message: 'Kategori güncellendi',
            data: category
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// 5. DELETE - Kategori sil (DELETE /api/categories/:id)
router.delete('/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;

        // 1. Kategoriyi sil
        const deleted = await Category.findByIdAndDelete(categoryId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Kategori bulunamadı'
            });
        }

        // 2. O kategoriye bağlı tüm bitkileri "inactive" yap
        const result = await Plant.updateMany(
            { categoryIds: categoryId },
            { $set: { status: 'inactive' } }
        );

        res.json({
            success: true,
            message: 'Kategori silindi ve bağlı bitkiler pasif hale getirildi',
            modifiedCount: result.modifiedCount // kaç bitki etkilendi
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Router'ı export ediyoruz
module.exports = router;
