
const Product = require("../models/Product");

const getCart = async (req, res) => {
  try {
    const { items = [] } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart items",
      });
    }

    const cartItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (
        !Product.db.base.Types.ObjectId.isValid(item.productId) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product or quantity",
        });
      }

      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      cartItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        quantity,
        subtotal: product.price * quantity,
      });

      totalAmount += product.price * quantity;
    }

    res.status(200).json({
      success: true,
      items: cartItems,
      totalAmount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { getCart };
