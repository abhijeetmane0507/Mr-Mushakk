require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const otpStore = new Map();

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// REQUEST OTP
app.post("/otp/request", async (req, res) => {
  try {
    const email = String(req.body.identifier || "").trim().toLowerCase();

    if (!validEmail(email)) {
      return res.status(400).json({
        ok: false,
        message: "Enter a valid email address."
      });
    }

    const otp = generateOtp();

    otpStore.set(email, {
      otp,
      expires: Date.now() + 5 * 60 * 1000
    });

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Mr Mushakk",
          email: process.env.BREVO_SENDER_EMAIL
        },
        to: [
          {
            email
          }
        ],
        subject: "Your Mr Mushakk OTP",
        htmlContent: `
          <div style="font-family:Arial,sans-serif">
            <h2>Mr Mushakk</h2>
            <p>Your login OTP is:</p>
            <h1>${otp}</h1>
            <p>This OTP is valid for 5 minutes.</p>
            <p>If you did not request this OTP, ignore this email.</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Brevo error:", error);

      return res.status(500).json({
        ok: false,
        message: "Could not send OTP."
      });
    }

    res.json({
      ok: true,
      message: "OTP sent successfully."
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Server error."
    });
  }
});

// VERIFY OTP
app.post("/otp/verify", (req, res) => {
  const email = String(req.body.identifier || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();

  const record = otpStore.get(email);

  if (!record) {
    return res.json({
      ok: false,
      message: "OTP not found."
    });
  }

  if (Date.now() > record.expires) {
    otpStore.delete(email);

    return res.json({
      ok: false,
      message: "OTP expired."
    });
  }

  if (code !== record.otp) {
    return res.json({
      ok: false,
      message: "Invalid OTP."
    });
  }

  otpStore.delete(email);

  res.json({
    ok: true,
    message: "OTP verified successfully."
  });
});

app.listen(PORT, () => {
  console.log(`Mr Mushakk OTP server running on http://localhost:${PORT}`);
});