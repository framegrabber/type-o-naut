# Deployment Checklist

## Pre-Deployment (Local Testing)

- [ ] Node.js 16+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Clone/navigate to project directory
- [ ] Run `npm install` to install all dependencies
- [ ] Run `npm run dev` and verify app loads at `http://localhost:5173`
- [ ] Test typing functionality with default configuration
- [ ] Click Settings button and verify Configuration Panel opens
- [ ] Toggle keyboard display with Keyboard button
- [ ] Test resetting and generating new text
- [ ] Check browser console for any errors (F12)
- [ ] Test on Chrome/Firefox/Safari for compatibility

## Local Build Test

- [ ] Run `npm run build` to create production build
- [ ] Verify `dist/` folder is created with files
- [ ] Run `npm run preview` to test production build locally
- [ ] Verify app works correctly in preview mode
- [ ] Check file sizes in `dist/` directory (should be <500KB for JS/CSS combined)

## Configuration File Testing

- [ ] Create test JSON files for keyboard layout, keymap, and text content
- [ ] Upload test files via Settings panel
- [ ] Verify validation catches invalid JSON
- [ ] Verify error messages are helpful and clear
- [ ] Test URL loading with hosted test files
- [ ] Test query parameters work correctly:
  - `?keyboardUrl=URL`
  - `?keymapUrl=URL`
  - `?textUrl=URL`

## GitHub Repository Setup

- [ ] Create GitHub repository (if not already done)
- [ ] Clone/initialize git repository locally
- [ ] Add all files to git: `git add .`
- [ ] Create initial commit: `git commit -m "Initial commit: type-o-naut typing trainer"`
- [ ] Add remote: `git remote add origin https://github.com/username/type-o-naut.git`
- [ ] Push to GitHub: `git push -u origin main`
- [ ] Verify files appear on GitHub website

## GitHub Pages Setup

- [ ] Go to repository Settings
- [ ] Navigate to "Pages" section (left sidebar)
- [ ] Under "Source", select "Deploy from a branch"
- [ ] Select branch: `gh-pages`
- [ ] Wait for initial deployment (may take 1-2 minutes)
- [ ] Verify GitHub Pages URL is shown in Settings

## GitHub Actions Setup

- [ ] Go to repository "Actions" tab
- [ ] Look for "Deploy to GitHub Pages" workflow
- [ ] Verify workflow file is at `.github/workflows/deploy.yml`
- [ ] Check that workflow has executed (green checkmark)
- [ ] If workflow failed, click it and read error messages
- [ ] Common issues:
  - npm install failed → check package.json syntax
  - npm run build failed → check for TypeScript errors
  - Deploy failed → check GitHub Pages settings

## Post-Deployment Testing

- [ ] Visit GitHub Pages URL: `https://username.github.io/type-o-naut/`
- [ ] Verify page loads without 404 errors
- [ ] Verify keyboard layout renders correctly
- [ ] Test typing functionality
- [ ] Click Settings and verify Configuration Panel works
- [ ] Test file upload with sample JSON
- [ ] Test URL parameters: `?keyboardUrl=...&keymapUrl=...&textUrl=...`
- [ ] Check browser console (F12) for any errors
- [ ] Test on mobile device for responsiveness

## Performance Check

- [ ] Open DevTools > Performance tab
- [ ] Record a typing session
- [ ] Verify smooth 60 FPS during keyboard highlighting
- [ ] Check Network tab:
  - Initial page load < 3 seconds
  - No failed requests
  - Total assets < 500KB
- [ ] Check lighthouse score (if using Chrome):
  - Performance > 90
  - Accessibility > 85

## Security Check

- [ ] Verify no sensitive data in code
- [ ] Check that external URLs are properly validated
- [ ] Verify localStorage is only used for custom text
- [ ] No API keys or secrets in repository
- [ ] HTTPS enabled (GitHub Pages default)

## Maintenance & Ongoing

- [ ] Document any custom keyboard layouts used
- [ ] Collect feedback from users
- [ ] Monitor GitHub issues for bug reports
- [ ] Keep dependencies up to date: `npm audit`
- [ ] Test new ZMK features when released
- [ ] Archive keyboard/keymap files for distribution

## Troubleshooting During Deployment

### Workflow Fails to Build
1. Check `.github/workflows/deploy.yml` exists
2. Look at Actions > Deploy > Logs
3. Common errors:
   - Missing `package.json` → verify file exists
   - TypeScript errors → run `npm run build` locally
   - Missing files → check git add/commit

### Pages Shows 404
1. Verify Pages source is set to "gh-pages" branch
2. Check that `gh-pages` branch exists in repository
3. Wait a few minutes for GitHub to process
4. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### App Loads But Is Blank
1. Check browser console (F12) for JavaScript errors
2. Verify `base` in `vite.config.ts` is `/type-o-naut/`
3. Check Network tab for failed asset loads
4. Verify `/type-o-naut/` URL matches base path setting

### Keyboard/Layout Won't Load
1. Check `public/defaults/` files exist
2. Verify file permissions allow reading
3. Check browser console for fetch errors
4. Try with manual file upload in Settings

## Deployment Success Indicators

✅ **Deployment Complete When:**
- [ ] GitHub Pages URL is accessible
- [ ] App loads without 404 errors
- [ ] Default keyboard and keymap display correctly
- [ ] Typing test is fully functional
- [ ] Settings panel works for file upload
- [ ] No JavaScript errors in console
- [ ] Performance metrics are acceptable
- [ ] Mobile responsiveness works

## After Deployment

### Share Your App
- [ ] Create share link
- [ ] Share with community
- [ ] Add to personal portfolio
- [ ] Post on GitHub trending

### Next Steps
1. **Gather feedback** - What features would users want?
2. **Monitor issues** - Set up issue templates
3. **Improvements** - Consider adding:
   - Statistics tracking
   - Multiple themes
   - More keyboard layouts
   - Language support
4. **Documentation** - Keep README and guides updated
5. **Maintenance** - Regular dependency updates

## Support Resources

- **GitHub Documentation**: https://docs.github.com/en/pages
- **Vite Documentation**: https://vitejs.dev/
- **React Documentation**: https://react.dev/
- **Tailwind Documentation**: https://tailwindcss.com/docs
- **TypeScript Documentation**: https://www.typescriptlang.org/docs/

## Contact & Community

- Report bugs on GitHub Issues
- Submit feature requests
- Contribute improvements via Pull Requests
- Share your keyboard layouts!

---

**All set!** Your typing trainer is ready to deploy. Good luck! 🚀
