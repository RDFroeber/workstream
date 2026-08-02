import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('../src/lib/api', async (orig) => ({ ...(await orig()), ...mocks }))
vi.mock('../src/lib/supabaseClient', () => ({ supabase: {}, isConfigured: true }))

const Auth = (await import('../src/components/Auth')).default
const NewPassword = (await import('../src/components/NewPassword')).default

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset().mockResolvedValue({})
})

const emailField = () => screen.getByLabelText('Email')

describe('asking for a reset link', () => {
  const goToForgot = () => {
    render(<Auth />)
    fireEvent.click(screen.getByText('Forgot your password?'))
  }

  it('is reachable from the sign-in screen', () => {
    goToForgot()
    expect(screen.getByText('Reset your password')).toBeTruthy()
  })

  it('drops the password field, which is irrelevant here', () => {
    goToForgot()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(emailField()).toBeTruthy()
  })

  it('sends the request', async () => {
    goToForgot()
    fireEvent.change(emailField(), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalledWith('a@b.com'))
  })

  it('does not sign in or sign up by mistake', async () => {
    goToForgot()
    fireEvent.change(emailField(), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(mocks.requestPasswordReset).toHaveBeenCalled())
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it('says the same thing whether or not the account exists', async () => {
    // Otherwise this form is a way to test which addresses are registered.
    goToForgot()
    fireEvent.change(emailField(), { target: { value: 'nobody@nowhere.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    const message = await screen.findByText(/If there's an account for that address/)
    expect(message).toBeTruthy()
    expect(message.textContent).not.toMatch(/not found|no account|doesn't exist/i)
  })

  it('reports a genuine failure, like being rate limited', async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error('Email rate limit exceeded'))
    goToForgot()
    fireEvent.change(emailField(), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Email rate limit exceeded')).toBeTruthy()
  })

  it('goes back to signing in', () => {
    goToForgot()
    fireEvent.click(screen.getByText(/Already have an account/))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('clears a stale notice when leaving', async () => {
    goToForgot()
    fireEvent.change(emailField(), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByText(/If there's an account/)
    fireEvent.click(screen.getByText(/Already have an account/))
    expect(screen.queryByText(/If there's an account/)).toBeNull()
  })

  it('is not offered while signing up', () => {
    render(<Auth />)
    fireEvent.click(screen.getByText(/Don't have an account/))
    expect(screen.queryByText('Forgot your password?')).toBeNull()
  })
})

describe('setting the new password', () => {
  const fill = (a, b = a) => {
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: a } })
    fireEvent.change(screen.getByLabelText('Confirm it'), { target: { value: b } })
  }
  // The submit handler is async, so settle it inside act to keep genuine
  // warnings from being lost under act() noise.
  const submit = async () =>
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
    })

  it('saves a good password and hands back to the app', async () => {
    const onDone = vi.fn()
    render(<NewPassword onDone={onDone} />)
    fill('a-long-enough-password')
    await submit()
    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith('a-long-enough-password'))
    expect(onDone).toHaveBeenCalled()
  })

  it('refuses a password that is too short, without calling the server', async () => {
    render(<NewPassword onDone={vi.fn()} />)
    fill('short')
    await submit()
    expect(await screen.findByText(/at least 8 characters/)).toBeTruthy()
    expect(mocks.updatePassword).not.toHaveBeenCalled()
  })

  it('catches a mistyped confirmation', async () => {
    render(<NewPassword onDone={vi.fn()} />)
    fill('a-long-enough-password', 'a-different-password')
    await submit()
    expect(await screen.findByText(/don't match/)).toBeTruthy()
    expect(mocks.updatePassword).not.toHaveBeenCalled()
  })

  it('does not finish when the server refuses', async () => {
    // Leaving the screen on a failure would strand the user with the old
    // password and no indication anything went wrong.
    const onDone = vi.fn()
    mocks.updatePassword.mockRejectedValue(new Error('New password should be different'))
    render(<NewPassword onDone={onDone} />)
    fill('a-long-enough-password')
    await submit()
    expect(await screen.findByText(/should be different/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('falls back to a readable message when the error has none', async () => {
    mocks.updatePassword.mockRejectedValue({})
    render(<NewPassword onDone={vi.fn()} />)
    fill('a-long-enough-password')
    await submit()
    expect(await screen.findByText(/could not be saved/)).toBeTruthy()
  })

  it('offers a way out for a link opened by mistake', () => {
    render(<NewPassword onDone={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel and sign out'))
    expect(mocks.signOut).toHaveBeenCalled()
  })

  it('blocks a double submit', async () => {
    let release
    mocks.updatePassword.mockReturnValue(new Promise((r) => (release = r)))
    render(<NewPassword onDone={vi.fn()} />)
    fill('a-long-enough-password')
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true)
    )
    await act(async () => release({}))
  })
})
