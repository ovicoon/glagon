document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.landing-container');
  const fadeElements = document.querySelectorAll('.fade-in');

  // IntersectionObserver 설정
  const observerOptions = {
    root: container, // scroll-snap 컨테이너 지정
    threshold: 0.2   // 화면에 20% 이상 등장할 때 동작
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, observerOptions);

  const spotlight = document.querySelector('.cursor-spotlight');

    if (spotlight) {
    window.addEventListener('mousemove', (e) => {
        // 마우스 좌표를 CSS 변수로 전달
        spotlight.style.setProperty('--x', `${e.clientX}px`);
        spotlight.style.setProperty('--y', `${e.clientY}px`);
    });
    }

  // 대상 요소들 감시 시작
  fadeElements.forEach(el => observer.observe(el));
});