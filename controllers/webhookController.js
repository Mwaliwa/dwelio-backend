const axios = require("axios");
const db = require("../db");


// ==========================================
// PAYCHANGU WEBHOOK HANDLER
// POST /api/webhook
// ==========================================

const handleWebhook = async (req, res) => {

  try {


    console.log(
      "📩 PAYCHANGU WEBHOOK RECEIVED"
    );

    console.log(req.body);



    /*
      Always respond quickly to PayChangu
      to prevent repeated webhook calls
    */

    res.status(200).json({

      success:true,

      message:
      "Webhook received"

    });



    const payload = req.body;



    // ------------------------------------
    // Extract transaction reference
    // ------------------------------------

    const tx_ref =
      payload.tx_ref ||
      payload.reference ||
      payload.data?.tx_ref;



    if(!tx_ref){


      console.log(
        "❌ Missing transaction reference"
      );


      return;


    }



    // ------------------------------------
    // Verify transaction with PayChangu
    // ------------------------------------


    const verification =
    await axios.get(

      `https://api.paychangu.com/verify-payment/${tx_ref}`,

      {

        headers:{

          Authorization:
          `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`

        }

      }

    );



    const payment =
    verification.data.data;



    if(!payment){


      console.log(
        "❌ Payment verification failed"
      );


      return;


    }



    // ------------------------------------
    // Successful Payment
    // ------------------------------------


    if(payment.status === "success"){



      console.log(
        "✅ Payment successful:",
        tx_ref
      );



      // Update payment record

      await db.query(

      `
      UPDATE payments

      SET

        status='successful',

        paychangu_reference=?,

        payment_method=?

      WHERE tx_ref=?

      `,

      [

        payment.reference || null,

        payment.payment_method || null,

        tx_ref

      ]

      );





      // Get booking id

      const [rows] =
      await db.query(

      `
      SELECT booking_id

      FROM payments

      WHERE tx_ref=?

      `,

      [
        tx_ref
      ]

      );





      if(rows.length > 0){


        const bookingId =
        rows[0].booking_id;



        // Confirm booking

        await db.query(

        `
        UPDATE bookings

        SET status='confirmed'

        WHERE id=?

        `,

        [
          bookingId
        ]

        );



        console.log(

          "🏠 Booking confirmed:",
          bookingId

        );


      }



    }



    // ------------------------------------
    // Failed Payment
    // ------------------------------------

    else {



      console.log(
        "❌ Payment failed:",
        tx_ref
      );



      await db.query(

      `
      UPDATE payments

      SET status='failed'

      WHERE tx_ref=?

      `,

      [
        tx_ref
      ]

      );


    }



  }


  catch(error){


    console.error(

      "🔥 WEBHOOK ERROR:",

      error.response?.data ||

      error.message

    );


  }


};




module.exports = {

  handleWebhook

};