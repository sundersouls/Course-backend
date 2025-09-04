import dotenv from "dotenv";
dotenv.config();

import express from "express";
import passport from "passport";
import { generateTokens, verifyRefreshToken } from "../utils/jwt.js";
import { PrismaClient } from "../generated/prisma/index.js";
import { requireAuth } from "../utils/reqAuth.js";

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false,
  }),
  (req, res) => {
    try {
      const { accessToken, refreshToken } = generateTokens(req.user);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const redirectUrl = req.user.isNewUser
        ? `${process.env.FRONTEND_URL}/register-complete?token=${accessToken}`
        : `${process.env.FRONTEND_URL}?token=${accessToken}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
    }
  },
);

router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] }),
);

router.get("/github/callback", (req, res, next) => {
  passport.authenticate("github", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false,
  })(req, res, (err) => {
    if (err) {
      console.error("GitHub auth error:", err);
      return res.redirect(
        `${process.env.FRONTEND_URL}/login?error=github_failed`,
      );
    }

    try {
      const { accessToken, refreshToken } = generateTokens(req.user);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const redirectUrl = req.user.isNewUser
        ? `${process.env.FRONTEND_URL}/register-complete?token=${accessToken}`
        : `${process.env.FRONTEND_URL}?token=${accessToken}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error("GitHub callback error:", error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
    }
  });
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token not found" });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({ error: "Token refresh failed" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out successfully" });
});

router.get("/logout", (req, res) => {
  res.clearCookie("refreshToken");
  const redirectTo = `${process.env.FRONTEND_URL}/login`;
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res.json({
      message: "Logged out successfully",
      redirect: redirectTo,
    });
  }
  return res.redirect(redirectTo);
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    isAdmin: req.user.isAdmin,
  });
});

export default router;
