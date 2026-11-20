import { ref } from 'vue';

export function useShareImageOptions(redraw) {
  const includePhoto = ref(true);
  const fillPhoto = ref(true);
  const includeInvitation = ref(true);
  const update = (option) => (value) => {
    if (option.value === value) return;
    option.value = value;
    return redraw();
  };
  function reset() {
    includePhoto.value = fillPhoto.value = includeInvitation.value = true;
  }
  return {
    includePhoto,
    fillPhoto,
    includeInvitation,
    setIncludePhoto: update(includePhoto),
    setFillPhoto: update(fillPhoto),
    setIncludeInvitation: update(includeInvitation),
    reset,
  };
}
