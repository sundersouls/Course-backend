import dotenv from "dotenv";
dotenv.config();

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { PrismaClient } from "../generated/prisma/index.js";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        "https://fleetbase.paylab.kz/course/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({
          where: {
            provider_providerId: {
              provider: "google",
              providerId: profile.id,
            },
          },
        });

        if (user) {
          return done(null, user);
        }

        const newUser = await prisma.user.create({
          data: {
            id: nanoid(),
            provider: "google",
            providerId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0].value,
            isAdmin: false,
          },
        });

        return done(null, { ...newUser, isNewUser: true });
      } catch (error) {
        console.error("Google auth error:", error);
        return done(error, null);
      }
    },
  ),
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:
        "https://fleetbase.paylab.kz/course/api/auth/github/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({
          where: {
            provider_providerId: {
              provider: "github",
              providerId: profile.id,
            },
          },
        });

        if (user) {
          return done(null, user);
        }

        const newUser = await prisma.user.create({
          data: {
            id: nanoid(),
            provider: "github",
            providerId: profile.id,
            name: profile.displayName || profile.username,
            email:
              profile.emails?.[0]?.value || `${profile.username}@github.local`,
            avatar: profile.photos?.[0]?.value,
            isAdmin: false,
          },
        });

        return done(null, { ...newUser, isNewUser: true });
      } catch (error) {
        console.error("GitHub auth error:", error);
        return done(error, null);
      }
    },
  ),
);

export default passport;
