// Express framework'ünü import ediyoruz
const express = require('express');

// Router instance oluşturuyoruz - modüler route yapısı için
const router = express.Router();

// Category model'ini import ediyoruz
const Category = require('../models/Categories');

const Plant = require('../models/Plants');

// ===== CATEGORY CRUD İŞLEMLERİ (Create, Read, Update, Delete) =====

// 1. READ - Tüm kategorileri getir (GET /api/categories)
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find(); // Tüm kategorileri getir

        res.json({
            success: true,
            data: categories
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

// 3. READ - Kategoriye ait bitkileri getir (GET /api/categories/:id/plants)
router.get('/:id/plants', async (req, res) => {
    try {
        const categoryId = req.params.id;

        // Bu kategoriye ait tüm bitkileri bul
        const plants = await Plant.find({ categoryId }).populate('categoryId');

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

// 3. CREATE - Yeni kategori oluştur (POST /api/categories)
router.post('/', async (req, res) => {
    try {
        const { name, description, icon } = req.body;

        const category = new Category({
            name,
            description,
            icon
        });

        await category.save();

        res.status(201).json({
            success: true,
            message: 'Kategori başarıyla oluşturuldu',
            data: category
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
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
            { categoryId: categoryId },
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
