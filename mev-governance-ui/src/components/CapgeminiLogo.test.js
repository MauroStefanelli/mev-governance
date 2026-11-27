import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CapgeminiLogo, { LOGO } from './CapgeminiLogo';
import HomePage from '../pages/HomePage';

const PUBLIC = path.resolve(__dirname, '..', '..', 'public');
const png = file => { const b = fs.readFileSync(path.join(PUBLIC, file)); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), size: b.length, signature: b.slice(0, 8).toString('hex') }; };

describe('the logo files', () => {
  test.each(Object.values(LOGO).map(logo => [logo.src.slice(1), logo]))('%s exists in public, is a real PNG, and its proportions are the ones the component declares (no distortion)', (file, logo) => {
    const info = png(file); expect(info.signature).toBe('89504e470d0a1a0a'); expect(info.width / info.height).toBeCloseTo(logo.ratio, 2); expect(info.size).toBeGreaterThan(1000); expect(info.size).toBeLessThan(120000);          // light: a logo is not a photograph
  });
  test('both are sharp on dense screens: at least twice the pixels they are shown at', () => {
    expect(png('capgemini-home.png').height).toBeGreaterThanOrEqual(2 * 48 - 1); expect(png('capgemini-bar.png').height).toBeGreaterThanOrEqual(2 * 32);
  });
});
describe('the component', () => {
  test('the bar version is a Capgemini image with a name for screen readers and the right size', () => {
    render(<CapgeminiLogo variant="bar" height={32} />); const img = screen.getByRole('img', { name: 'Capgemini' }); expect(img).toHaveAttribute('src', '/capgemini-bar.png'); expect(img).toHaveAttribute('height', '32'); expect(img).toHaveAttribute('width', '32');
  });
  test('the home version keeps the proportions of the file at any height', () => {
    const { rerender } = render(<CapgeminiLogo variant="home" height={48} />); expect(screen.getByRole('img')).toHaveAttribute('width', String(Math.round(48 * LOGO.home.ratio)));
    rerender(<CapgeminiLogo variant="home" height={30} />); expect(screen.getByRole('img')).toHaveAttribute('width', String(Math.round(30 * LOGO.home.ratio)));
  });
  test('on the dark theme the extended logo sits on a white plate (blue on dark blue is not readable); on the light theme there is no plate', () => {
    const { container, rerender } = render(<CapgeminiLogo variant="home" dark />); expect(container.querySelector('.cg-plate')).toHaveStyle({ background: '#ffffff' });
    rerender(<CapgeminiLogo variant="home" />); expect(container.querySelector('.cg-plate')).toBeNull();
  });
  test('the bar version never gets a plate: it is already white, readable on the dark bar', () => { const { container } = render(<CapgeminiLogo variant="bar" dark />); expect(container.querySelector('.cg-plate')).toBeNull(); });
  test('an unknown variant falls back to the bar logo instead of breaking', () => { render(<CapgeminiLogo variant="boh" />); expect(screen.getByRole('img')).toHaveAttribute('src', '/capgemini-bar.png'); });
});
describe('where it is', () => {
  const home = (userTheme = 'light') => render(<HomePage username="u" fullName="Mauro S" role="SuperAdmin" roles={['SuperAdmin']} ambienti={[{ id: 1, codiceContratto: 'C1' }]} ambienteId={1} onNavigate={() => {}} appPerms={null} userTheme={userTheme} />);
  test('in the Home it is the big one, and it comes BEFORE the logo of the customer', () => {
    home(); const images = document.querySelectorAll('header img'); expect(images[0]).toHaveAttribute('src', '/capgemini-home.png'); expect(images[1]).toHaveAttribute('src', '/logo_poste.svg'); expect(images[0].getAttribute('height')).toBe('48');
  });
  test('in the Home, dark theme: on the white plate', () => { home('dark'); expect(document.querySelector('header .cg-plate img')).toHaveAttribute('src', '/capgemini-home.png'); });
  test('the home page does not have the bar logo (it has the big one)', () => { home(); expect(document.querySelector('img[src="/capgemini-bar.png"]')).toBeNull(); });
  test('in every other page it is in the top bar, BEFORE the «Home» button: the source says so, in this order', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '..', 'App.js'), 'utf8'); const bar = app.slice(app.indexOf('BARRA HOME'), app.indexOf('Modale profilo'));
    expect(bar.indexOf('<CapgeminiLogo variant="bar"')).toBeGreaterThan(-1); expect(bar.indexOf('<CapgeminiLogo variant="bar"')).toBeLessThan(bar.indexOf('onClick={() => setPage("home")}'));
    expect(bar.indexOf('page !== "home"')).toBeGreaterThan(-1);                                       // the bar is on every page except the Home
    expect(app.match(/<CapgeminiLogo/g)).toHaveLength(1);                                                // one place only: no page can forget it or show it twice
  });
  test('the bar gives way on a phone instead of scrolling sideways (customer logo, contract and user name are hidden, the Capgemini logo and Home stay)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'App.css'), 'utf8'); const phone = css.slice(css.indexOf('@media (max-width: 760px)', css.indexOf('Barra in alto')));
    expect(phone).toMatch(/\.app-topbar-center > img/); expect(phone).toMatch(/\.app-topbar-right > span \{ display: none; \}/);
    expect(phone).not.toMatch(/cg-|capgemini|\.app-topbar-left|logo-bar/i);                            // nothing in the phone rules touches the Capgemini logo
  });
});
