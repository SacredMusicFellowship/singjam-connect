import { fireEvent, render, screen } from '@testing-library/react-native';
import SetQrModal from '../SetQrModal';

describe('SetQrModal', () => {
  it("shows the set's QR from the web API with web's welcome, and closes on Done", async () => {
    const onClose = jest.fn();
    const uri = 'http://localhost:3100/api/sets/set-1/qr?invite=tok';
    await render(<SetQrModal uri={uri} onClose={onClose} />);

    expect(screen.getByText("Scan to see today's songs")).toBeTruthy();
    expect(screen.getByLabelText('QR code invite link').props.source).toEqual({ uri });
    await fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing without a QR', async () => {
    await render(<SetQrModal uri={null} onClose={jest.fn()} />);
    expect(screen.queryByText("Scan to see today's songs")).toBeNull();
  });
});
